package com.undertheradar.vpn.data.model

import com.google.gson.annotations.SerializedName

data class User(
    val id: String,
    val email: String,
    @SerializedName("subscriptionType")
    val subscriptionType: String,
    @SerializedName("subscriptionStatus")
    val subscriptionStatus: String,
    @SerializedName("subscriptionExpiry")
    val subscriptionExpiry: String?,
    @SerializedName("VPNClients")
    val vpnClients: List<VpnClient>? = null
)

data class VpnClient(
    val id: String,
    val name: String,
    @SerializedName("ipAddress")
    val ipAddress: String,
    @SerializedName("isActive")
    val isActive: Boolean,
    @SerializedName("createdAt")
    val createdAt: String
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val user: User
)

data class CreateClientRequest(
    val name: String
)

data class CreateClientResponse(
    val message: String,
    val client: VpnClient
)

data class ConfigResponse(
    val config: String
)

data class QRResponse(
    @SerializedName("qrCode")
    val qrCode: String
)