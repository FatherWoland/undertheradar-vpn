package com.undertheradar.vpn.ui.main

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.undertheradar.vpn.UnderTheRadarApplication
import com.undertheradar.vpn.data.model.VpnClient
import com.undertheradar.vpn.data.repository.AuthRepository
import com.undertheradar.vpn.data.repository.VpnRepository
import com.undertheradar.vpn.data.repository.VpnState
import com.undertheradar.vpn.service.VpnService
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class MainViewModel(
    private val authRepository: AuthRepository,
    private val vpnRepository: VpnRepository
) : ViewModel() {

    val isLoggedIn = authRepository.isLoggedIn.asStateFlow()
    val currentUser = authRepository.currentUser.asStateFlow()
    val vpnClients = vpnRepository.vpnClients.asStateFlow()
    val connectionState = vpnRepository.connectionState.asStateFlow()

    private val _error = MutableSharedFlow<String>()
    val error = _error.asSharedFlow()

    private var selectedClient: VpnClient? = null

    init {
        refreshData()
    }

    fun checkAuthenticationStatus() {
        viewModelScope.launch {
            if (isLoggedIn.value) {
                val result = authRepository.fetchUserProfile()
                if (result.isFailure) {
                    // Token might be expired, logout
                    authRepository.logout()
                }
            }
        }
    }

    private fun refreshData() {
        viewModelScope.launch {
            if (isLoggedIn.value) {
                authRepository.fetchUserProfile()
                vpnRepository.refreshVpnClients()
            }
        }
    }

    fun createClient(name: String) {
        viewModelScope.launch {
            if (!authRepository.hasActiveSubscription()) {
                _error.emit("Active subscription required to add devices")
                return@launch
            }

            val result = vpnRepository.createVpnClient(name)
            if (result.isFailure) {
                _error.emit(result.exceptionOrNull()?.message ?: "Failed to create device")
            }
        }
    }

    fun deleteClient(clientId: String) {
        viewModelScope.launch {
            val result = vpnRepository.deleteClient(clientId)
            if (result.isFailure) {
                _error.emit(result.exceptionOrNull()?.message ?: "Failed to delete device")
            }
        }
    }

    fun selectClient(client: VpnClient) {
        selectedClient = client
    }

    fun connectToVpn() {
        selectedClient?.let { client ->
            viewModelScope.launch {
                if (!authRepository.hasActiveSubscription()) {
                    _error.emit("Active subscription required to connect")
                    return@launch
                }

                vpnRepository.updateConnectionState(VpnState.CONNECTING)
                
                val result = vpnRepository.getClientConfig(client.id)
                if (result.isSuccess) {
                    val config = result.getOrNull()
                    if (config != null) {
                        startVpnService(config)
                    }
                } else {
                    vpnRepository.updateConnectionState(VpnState.ERROR)
                    _error.emit("Failed to get VPN configuration")
                }
            }
        } ?: run {
            _error.emit("Please select a device first")
        }
    }

    fun disconnect() {
        vpnRepository.updateConnectionState(VpnState.DISCONNECTING)
        stopVpnService()
    }

    fun importConfig(config: String) {
        // This would parse and import a WireGuard config
        // For now, we'll just show an error that this should be done via the web interface
        viewModelScope.launch {
            _error.emit("Please add devices through your account dashboard")
        }
    }

    fun updateConnectionState(state: VpnState) {
        vpnRepository.updateConnectionState(state)
    }

    fun logout() {
        authRepository.logout()
    }

    private fun startVpnService(config: String) {
        val context = UnderTheRadarApplication.instance
        val intent = Intent(context, VpnService::class.java).apply {
            action = VpnService.ACTION_CONNECT
            putExtra(VpnService.EXTRA_CONFIG, config)
        }
        context.startService(intent)
    }

    private fun stopVpnService() {
        val context = UnderTheRadarApplication.instance
        val intent = Intent(context, VpnService::class.java).apply {
            action = VpnService.ACTION_DISCONNECT
        }
        context.startService(intent)
    }
}

class MainViewModelFactory(
    private val authRepository: AuthRepository,
    private val vpnRepository: VpnRepository
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MainViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return MainViewModel(authRepository, vpnRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}