package com.undertheradar.vpn.ui.main

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.undertheradar.vpn.R
import com.undertheradar.vpn.data.model.VpnClient
import com.undertheradar.vpn.databinding.ItemVpnClientBinding
import java.text.SimpleDateFormat
import java.util.*

class VpnClientsAdapter(
    private val onConnectClick: (VpnClient) -> Unit,
    private val onDeleteClick: (VpnClient) -> Unit
) : RecyclerView.Adapter<VpnClientsAdapter.VpnClientViewHolder>() {

    private var clients = listOf<VpnClient>()

    fun updateClients(newClients: List<VpnClient>) {
        val oldClients = clients
        clients = newClients
        
        DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize() = oldClients.size
            override fun getNewListSize() = newClients.size
            
            override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean {
                return oldClients[oldItemPosition].id == newClients[newItemPosition].id
            }
            
            override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean {
                return oldClients[oldItemPosition] == newClients[newItemPosition]
            }
        }).dispatchUpdatesTo(this)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VpnClientViewHolder {
        val binding = ItemVpnClientBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return VpnClientViewHolder(binding)
    }

    override fun onBindViewHolder(holder: VpnClientViewHolder, position: Int) {
        holder.bind(clients[position])
    }

    override fun getItemCount() = clients.size

    inner class VpnClientViewHolder(
        private val binding: ItemVpnClientBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(client: VpnClient) {
            binding.textDeviceName.text = client.name
            binding.textDeviceIp.text = client.ipAddress
            
            // Format creation date
            try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                val outputFormat = SimpleDateFormat("MMM dd, yyyy", Locale.US)
                val date = inputFormat.parse(client.createdAt)
                binding.textDeviceCreated.text = "Created: ${outputFormat.format(date)}"
            } catch (e: Exception) {
                binding.textDeviceCreated.text = "Created: ${client.createdAt}"
            }
            
            // Set device icon based on device name
            val iconRes = when {
                client.name.lowercase().contains("phone") || 
                client.name.lowercase().contains("mobile") -> R.drawable.ic_device_phone
                client.name.lowercase().contains("laptop") || 
                client.name.lowercase().contains("computer") -> R.drawable.ic_device_laptop
                client.name.lowercase().contains("tablet") -> R.drawable.ic_device_tablet
                else -> R.drawable.ic_device_phone
            }
            binding.imageDeviceIcon.setImageResource(iconRes)
            
            // Set up click listeners
            binding.buttonConnect.setOnClickListener {
                onConnectClick(client)
            }
            
            binding.buttonDelete.setOnClickListener {
                onDeleteClick(client)
            }
        }
    }
}