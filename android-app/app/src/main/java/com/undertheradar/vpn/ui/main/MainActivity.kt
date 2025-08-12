package com.undertheradar.vpn.ui.main

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.VpnService
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.undertheradar.vpn.R
import com.undertheradar.vpn.UnderTheRadarApplication
import com.undertheradar.vpn.data.repository.VpnState
import com.undertheradar.vpn.databinding.ActivityMainBinding
import com.undertheradar.vpn.ui.auth.AuthActivity
import com.undertheradar.vpn.ui.scanner.QRScannerActivity
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: MainViewModel
    private lateinit var clientsAdapter: VpnClientsAdapter
    
    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            // VPN permission granted, start connection
            viewModel.connectToVpn()
        }
    }
    
    private val qrScannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val config = result.data?.getStringExtra("config")
            if (config != null) {
                viewModel.importConfig(config)
            }
        }
    }
    
    private val vpnStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val state = intent?.getStringExtra("state")
            when (state) {
                "CONNECTED" -> viewModel.updateConnectionState(VpnState.CONNECTED)
                "DISCONNECTED" -> viewModel.updateConnectionState(VpnState.DISCONNECTED)
                "ERROR" -> {
                    viewModel.updateConnectionState(VpnState.ERROR)
                    showError("VPN connection failed")
                }
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Initialize ViewModel
        val app = application as UnderTheRadarApplication
        viewModel = ViewModelProvider(this, MainViewModelFactory(app.authRepository, app.vpnRepository))
            .get(MainViewModel::class.java)
        
        // Setup UI
        setupToolbar()
        setupRecyclerView()
        setupFab()
        observeViewModel()
        
        // Register broadcast receiver
        registerReceiver(vpnStateReceiver, IntentFilter("VPN_STATE_CHANGED"))
        
        // Check authentication
        viewModel.checkAuthenticationStatus()
    }
    
    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = "UnderTheRadar VPN"
        
        binding.toolbar.setOnMenuItemClickListener { menuItem ->
            when (menuItem.itemId) {
                R.id.action_logout -> {
                    viewModel.logout()
                    true
                }
                R.id.action_scan_qr -> {
                    launchQRScanner()
                    true
                }
                else -> false
            }
        }
    }
    
    private fun setupRecyclerView() {
        clientsAdapter = VpnClientsAdapter(
            onConnectClick = { client ->
                viewModel.selectClient(client)
                requestVpnPermission()
            },
            onDeleteClick = { client ->
                showDeleteConfirmation(client)
            }
        )
        
        binding.recyclerViewClients.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = clientsAdapter
        }
    }
    
    private fun setupFab() {
        binding.fabAddClient.setOnClickListener {
            showAddClientDialog()
        }
    }
    
    private fun observeViewModel() {
        lifecycleScope.launch {
            viewModel.isLoggedIn.collect { isLoggedIn ->
                if (!isLoggedIn) {
                    navigateToAuth()
                }
            }
        }
        
        lifecycleScope.launch {
            viewModel.currentUser.collect { user ->
                user?.let {
                    binding.textUserEmail.text = it.email
                    binding.textSubscriptionType.text = it.subscriptionType.uppercase()
                    binding.textSubscriptionStatus.text = it.subscriptionStatus.uppercase()
                    
                    // Show subscription warning if not active
                    if (it.subscriptionStatus != "active") {
                        binding.cardSubscriptionWarning.visibility = android.view.View.VISIBLE
                    } else {
                        binding.cardSubscriptionWarning.visibility = android.view.View.GONE
                    }
                }
            }
        }
        
        lifecycleScope.launch {
            viewModel.vpnClients.collect { clients ->
                clientsAdapter.updateClients(clients)
                binding.textEmptyState.visibility = if (clients.isEmpty()) {
                    android.view.View.VISIBLE
                } else {
                    android.view.View.GONE
                }
            }
        }
        
        lifecycleScope.launch {
            viewModel.connectionState.collect { state ->
                updateConnectionUI(state)
            }
        }
        
        lifecycleScope.launch {
            viewModel.error.collect { error ->
                error?.let { showError(it) }
            }
        }
    }
    
    private fun updateConnectionUI(state: VpnState) {
        when (state) {
            VpnState.DISCONNECTED -> {
                binding.buttonConnection.text = "Connect"
                binding.buttonConnection.setBackgroundColor(getColor(R.color.green_500))
                binding.textConnectionStatus.text = "Disconnected"
            }
            VpnState.CONNECTING -> {
                binding.buttonConnection.text = "Connecting..."
                binding.buttonConnection.setBackgroundColor(getColor(R.color.orange_500))
                binding.textConnectionStatus.text = "Connecting..."
            }
            VpnState.CONNECTED -> {
                binding.buttonConnection.text = "Disconnect"
                binding.buttonConnection.setBackgroundColor(getColor(R.color.red_500))
                binding.textConnectionStatus.text = "Connected"
            }
            VpnState.DISCONNECTING -> {
                binding.buttonConnection.text = "Disconnecting..."
                binding.buttonConnection.setBackgroundColor(getColor(R.color.orange_500))
                binding.textConnectionStatus.text = "Disconnecting..."
            }
            VpnState.ERROR -> {
                binding.buttonConnection.text = "Connect"
                binding.buttonConnection.setBackgroundColor(getColor(R.color.green_500))
                binding.textConnectionStatus.text = "Connection Failed"
            }
        }
        
        binding.buttonConnection.setOnClickListener {
            when (state) {
                VpnState.CONNECTED -> viewModel.disconnect()
                VpnState.DISCONNECTED, VpnState.ERROR -> requestVpnPermission()
                else -> {} // Do nothing when connecting/disconnecting
            }
        }
    }
    
    private fun requestVpnPermission() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnPermissionLauncher.launch(intent)
        } else {
            // Permission already granted
            viewModel.connectToVpn()
        }
    }
    
    private fun showAddClientDialog() {
        val editText = android.widget.EditText(this).apply {
            hint = "Device name (e.g., Phone, Laptop)"
        }
        
        MaterialAlertDialogBuilder(this)
            .setTitle("Add New Device")
            .setView(editText)
            .setPositiveButton("Add") { _, _ ->
                val deviceName = editText.text.toString().trim()
                if (deviceName.isNotEmpty()) {
                    viewModel.createClient(deviceName)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun showDeleteConfirmation(client: com.undertheradar.vpn.data.model.VpnClient) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Device")
            .setMessage("Are you sure you want to delete '${client.name}'?")
            .setPositiveButton("Delete") { _, _ ->
                viewModel.deleteClient(client.id)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun launchQRScanner() {
        val intent = Intent(this, QRScannerActivity::class.java)
        qrScannerLauncher.launch(intent)
    }
    
    private fun navigateToAuth() {
        val intent = Intent(this, AuthActivity::class.java)
        startActivity(intent)
        finish()
    }
    
    private fun showError(message: String) {
        Snackbar.make(binding.root, message, Snackbar.LENGTH_LONG).show()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(vpnStateReceiver)
    }
}