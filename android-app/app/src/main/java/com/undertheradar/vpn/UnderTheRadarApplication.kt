package com.undertheradar.vpn

import android.app.Application
import com.undertheradar.vpn.data.repository.AuthRepository
import com.undertheradar.vpn.data.repository.VpnRepository
import com.undertheradar.vpn.network.ApiService
import com.undertheradar.vpn.network.RetrofitClient

class UnderTheRadarApplication : Application() {
    
    // Lazy initialization of dependencies
    val apiService: ApiService by lazy {
        RetrofitClient.create()
    }
    
    val authRepository: AuthRepository by lazy {
        AuthRepository(this, apiService)
    }
    
    val vpnRepository: VpnRepository by lazy {
        VpnRepository(this, apiService)
    }
    
    override fun onCreate() {
        super.onCreate()
        instance = this
    }
    
    companion object {
        lateinit var instance: UnderTheRadarApplication
            private set
    }
}