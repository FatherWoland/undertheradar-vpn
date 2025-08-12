package com.undertheradar.vpn.network

import com.undertheradar.vpn.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    
    @POST("login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
    
    @GET("profile")
    suspend fun getProfile(): Response<ApiResponse<User>>
    
    @POST("clients")
    suspend fun createClient(@Body request: CreateClientRequest): Response<CreateClientResponse>
    
    @GET("clients/{id}/config")
    suspend fun getClientConfig(@Path("id") clientId: String): Response<ConfigResponse>
    
    @GET("clients/{id}/qr")
    suspend fun getClientQR(@Path("id") clientId: String): Response<QRResponse>
    
    @DELETE("clients/{id}")
    suspend fun deleteClient(@Path("id") clientId: String): Response<ApiResponse<String>>
    
    @POST("create-checkout-session")
    suspend fun createCheckoutSession(@Body request: CheckoutRequest): Response<CheckoutResponse>
}

data class ApiResponse<T>(
    val success: Boolean = true,
    val data: T? = null,
    val user: T? = null,
    val message: String? = null,
    val error: String? = null
)

data class CheckoutRequest(
    val priceId: String,
    val successUrl: String,
    val cancelUrl: String
)

data class CheckoutResponse(
    val sessionId: String,
    val url: String
)