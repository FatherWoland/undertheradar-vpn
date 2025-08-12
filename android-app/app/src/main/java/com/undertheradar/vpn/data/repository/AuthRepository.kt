package com.undertheradar.vpn.data.repository

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.undertheradar.vpn.data.model.LoginRequest
import com.undertheradar.vpn.data.model.User
import com.undertheradar.vpn.network.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AuthRepository(
    private val context: Context,
    private val apiService: ApiService
) {
    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()
    
    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()
    
    init {
        // Check if user is already logged in
        val token = getStoredToken()
        _isLoggedIn.value = token != null
    }
    
    suspend fun login(email: String, password: String): Result<User> {
        return try {
            val response = apiService.login(LoginRequest(email, password))
            if (response.isSuccessful && response.body() != null) {
                val loginResponse = response.body()!!
                storeToken(loginResponse.token)
                _currentUser.value = loginResponse.user
                _isLoggedIn.value = true
                Result.success(loginResponse.user)
            } else {
                Result.failure(Exception("Login failed: ${response.errorBody()?.string()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun fetchUserProfile(): Result<User> {
        return try {
            val response = apiService.getProfile()
            if (response.isSuccessful && response.body() != null) {
                val user = response.body()!!.user ?: response.body()!!.data
                if (user != null) {
                    _currentUser.value = user
                    Result.success(user)
                } else {
                    Result.failure(Exception("User data not found"))
                }
            } else {
                Result.failure(Exception("Failed to fetch profile: ${response.errorBody()?.string()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    fun logout() {
        clearToken()
        _currentUser.value = null
        _isLoggedIn.value = false
    }
    
    fun hasActiveSubscription(): Boolean {
        val user = _currentUser.value ?: return false
        return user.subscriptionStatus == "active"
    }
    
    private fun getEncryptedPrefs() = EncryptedSharedPreferences.create(
        "auth_prefs",
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    private fun storeToken(token: String) {
        getEncryptedPrefs().edit()
            .putString("auth_token", token)
            .apply()
    }
    
    private fun clearToken() {
        getEncryptedPrefs().edit()
            .remove("auth_token")
            .apply()
    }
    
    companion object {
        private var instance: AuthRepository? = null
        
        fun getStoredToken(): String? {
            // This is a simplified version - in real implementation,
            // we'd need context to access encrypted preferences
            return instance?.getEncryptedPrefs()?.getString("auth_token", null)
        }
        
        fun setInstance(authRepository: AuthRepository) {
            instance = authRepository
        }
    }
}