package com.undertheradar.vpn.data.repository

import android.content.Context
import com.undertheradar.vpn.data.model.*
import com.undertheradar.vpn.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class VpnRepository(
    private val context: Context,
    private val apiService: ApiService
) {
    
    private val _vpnClients = MutableStateFlow<List<VpnClient>>(emptyList())
    val vpnClients: StateFlow<List<VpnClient>> = _vpnClients.asStateFlow()
    
    private val _connectionState = MutableStateFlow(VpnState.DISCONNECTED)
    val connectionState: StateFlow<VpnState> = _connectionState.asStateFlow()
    
    suspend fun createVpnClient(name: String): Result<VpnClient> {
        return try {
            val response = apiService.createClient(CreateClientRequest(name))
            if (response.isSuccessful && response.body() != null) {
                val newClient = response.body()!!.client
                // Refresh the client list
                refreshVpnClients()
                Result.success(newClient)
            } else {
                Result.failure(Exception("Failed to create client: ${response.errorBody()?.string()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun getClientConfig(clientId: String): Result<String> {
        return try {
            val response = apiService.getClientConfig(clientId)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!.config)
            } else {
                Result.failure(Exception("Failed to get config: ${response.errorBody()?.string()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun deleteClient(clientId: String): Result<Unit> {
        return try {
            val response = apiService.deleteClient(clientId)
            if (response.isSuccessful) {
                // Refresh the client list
                refreshVpnClients()
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to delete client: ${response.errorBody()?.string()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun refreshVpnClients() {
        try {
            val response = apiService.getProfile()
            if (response.isSuccessful && response.body() != null) {
                val user = response.body()!!.user ?: response.body()!!.data
                _vpnClients.value = user?.vpnClients ?: emptyList()
            }
        } catch (e: Exception) {
            // Handle error silently or emit an error state
        }
    }
    
    fun updateConnectionState(state: VpnState) {
        _connectionState.value = state
    }
}

enum class VpnState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    ERROR
}