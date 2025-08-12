package com.undertheradar.vpn.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import com.undertheradar.vpn.R
import com.undertheradar.vpn.ui.main.MainActivity
import com.wireguard.android.backend.GoBackend
import com.wireguard.config.Config
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class VpnService : VpnService() {
    
    private var vpnInterface: ParcelFileDescriptor? = null
    private var backend: GoBackend? = null
    private var currentConfig: Config? = null
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    
    companion object {
        const val ACTION_CONNECT = "com.undertheradar.vpn.CONNECT"
        const val ACTION_DISCONNECT = "com.undertheradar.vpn.DISCONNECT"
        const val EXTRA_CONFIG = "config"
        const val NOTIFICATION_CHANNEL_ID = "vpn_service"
        const val NOTIFICATION_ID = 1
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        backend = GoBackend(applicationContext)
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val config = intent.getStringExtra(EXTRA_CONFIG)
                if (config != null) {
                    connectVpn(config)
                }
            }
            ACTION_DISCONNECT -> {
                disconnectVpn()
            }
        }
        return START_STICKY
    }
    
    private fun connectVpn(configText: String) {
        scope.launch {
            try {
                val config = Config.parse(configText.byteInputStream())
                currentConfig = config
                
                // Create VPN interface
                val builder = Builder()
                    .setMtu(1420)
                    .setSession("UnderTheRadar VPN")
                
                // Configure from WireGuard config
                config.`interface`.addresses.forEach { address ->
                    builder.addAddress(address.address, address.mask)
                }
                
                config.`interface`.dnsServers.forEach { dns ->
                    builder.addDnsServer(dns)
                }
                
                // Add routes
                config.peers.forEach { peer ->
                    peer.allowedIps.forEach { allowedIp ->
                        builder.addRoute(allowedIp.address, allowedIp.mask)
                    }
                }
                
                // Establish VPN
                vpnInterface = builder.establish()
                
                if (vpnInterface != null) {
                    // Start WireGuard tunnel
                    backend?.setState(
                        tunnel = object : com.wireguard.android.backend.Tunnel {
                            override fun getName(): String = "UnderTheRadar"
                            override fun onStateChange(newState: com.wireguard.android.backend.Tunnel.State) {
                                // Handle state changes
                            }
                        },
                        state = com.wireguard.android.backend.Tunnel.State.UP,
                        config = config
                    )
                    
                    startForeground(NOTIFICATION_ID, createNotification(true))
                    sendBroadcast(Intent("VPN_STATE_CHANGED").putExtra("state", "CONNECTED"))
                }
            } catch (e: Exception) {
                sendBroadcast(Intent("VPN_STATE_CHANGED").putExtra("state", "ERROR"))
            }
        }
    }
    
    private fun disconnectVpn() {
        scope.launch {
            try {
                backend?.setState(
                    tunnel = object : com.wireguard.android.backend.Tunnel {
                        override fun getName(): String = "UnderTheRadar"
                        override fun onStateChange(newState: com.wireguard.android.backend.Tunnel.State) {}
                    },
                    state = com.wireguard.android.backend.Tunnel.State.DOWN,
                    config = null
                )
                
                vpnInterface?.close()
                vpnInterface = null
                currentConfig = null
                
                stopForeground(true)
                sendBroadcast(Intent("VPN_STATE_CHANGED").putExtra("state", "DISCONNECTED"))
                stopSelf()
            } catch (e: Exception) {
                sendBroadcast(Intent("VPN_STATE_CHANGED").putExtra("state", "ERROR"))
            }
        }
    }
    
    private fun createNotification(connected: Boolean): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val title = if (connected) "VPN Connected" else "VPN Connecting..."
        val text = if (connected) "Secure connection established" else "Establishing secure connection..."
        
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_vpn_key)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "VPN Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "VPN connection status"
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        vpnInterface?.close()
    }
}