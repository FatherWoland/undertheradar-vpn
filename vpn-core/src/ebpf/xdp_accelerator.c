/* SPDX-License-Identifier: GPL-2.0 */
#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/ipv6.h>
#include <linux/udp.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define MAX_PEERS 10000
#define WIREGUARD_PORT 51820
#define MAX_CPU 128

/* WireGuard message types */
#define WIREGUARD_MESSAGE_HANDSHAKE_INITIATION 1
#define WIREGUARD_MESSAGE_HANDSHAKE_RESPONSE 2
#define WIREGUARD_MESSAGE_HANDSHAKE_COOKIE 3
#define WIREGUARD_MESSAGE_DATA 4

struct wireguard_header {
    __u8 type;
    __u8 reserved[3];
    __u32 sender;
    __u64 counter;
} __attribute__((packed));

/* Per-CPU statistics for lock-free updates */
struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct vpn_stats);
} stats_map SEC(".maps");

struct vpn_stats {
    __u64 rx_packets;
    __u64 rx_bytes;
    __u64 tx_packets;
    __u64 tx_bytes;
    __u64 dropped_packets;
    __u64 invalid_packets;
};

/* Peer lookup table using LPM trie for efficient IP matching */
struct {
    __uint(type, BPF_MAP_TYPE_LPM_TRIE);
    __uint(max_entries, MAX_PEERS);
    __uint(key_size, sizeof(struct bpf_lpm_trie_key) + sizeof(__u32));
    __uint(value_size, sizeof(struct peer_info));
    __uint(map_flags, BPF_F_NO_PREALLOC);
} peer_lookup SEC(".maps");

struct peer_info {
    __u32 peer_id;
    __u8 public_key[32];
    __u32 allowed_ips[4];  /* Support up to 4 subnets per peer */
    __u8 allowed_masks[4];
    __u64 rx_packets;
    __u64 tx_packets;
    __u64 last_handshake;
};

/* Connection tracking for stateful filtering */
struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 1000000);
    __type(key, struct flow_key);
    __type(value, struct flow_state);
} flow_table SEC(".maps");

struct flow_key {
    __be32 src_ip;
    __be32 dst_ip;
    __be16 src_port;
    __be16 dst_port;
    __u8 protocol;
} __attribute__((packed));

struct flow_state {
    __u64 packets;
    __u64 bytes;
    __u64 last_seen;
    __u8 state;
};

/* Rate limiting using token bucket */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 100000);
    __type(key, __be32);  /* Source IP */
    __type(value, struct rate_limit);
} rate_limit_map SEC(".maps");

struct rate_limit {
    __u64 tokens;
    __u64 last_update;
};

/* XDP program for ultra-fast packet filtering and acceleration */
SEC("xdp/undertheradar_vpn")
int xdp_vpn_filter(struct xdp_md *ctx)
{
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;
    struct ethhdr *eth = data;
    struct iphdr *ip;
    struct udphdr *udp;
    struct wireguard_header *wg;
    struct vpn_stats *stats;
    __u32 key = 0;
    
    /* Bounds checking */
    if ((void *)(eth + 1) > data_end)
        return XDP_DROP;
    
    /* Update statistics */
    stats = bpf_map_lookup_elem(&stats_map, &key);
    if (stats) {
        __sync_fetch_and_add(&stats->rx_packets, 1);
        __sync_fetch_and_add(&stats->rx_bytes, data_end - data);
    }
    
    /* Only process IPv4 for now */
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return XDP_PASS;
    
    ip = (struct iphdr *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_DROP;
    
    /* Fast path for established VPN connections */
    if (ip->protocol == IPPROTO_UDP) {
        udp = (struct udphdr *)((void *)ip + ip->ihl * 4);
        if ((void *)(udp + 1) > data_end)
            return XDP_DROP;
        
        /* Check if it's WireGuard traffic */
        if (udp->dest == bpf_htons(WIREGUARD_PORT)) {
            wg = (struct wireguard_header *)(udp + 1);
            if ((void *)(wg + 1) > data_end)
                return XDP_DROP;
            
            /* Apply rate limiting */
            if (!check_rate_limit(ip->saddr)) {
                if (stats)
                    __sync_fetch_and_add(&stats->dropped_packets, 1);
                return XDP_DROP;
            }
            
            /* Fast path for data packets */
            if (wg->type == WIREGUARD_MESSAGE_DATA) {
                /* Validate sender and update flow state */
                struct flow_key flow = {
                    .src_ip = ip->saddr,
                    .dst_ip = ip->daddr,
                    .src_port = udp->source,
                    .dst_port = udp->dest,
                    .protocol = IPPROTO_UDP
                };
                
                struct flow_state *state = bpf_map_lookup_elem(&flow_table, &flow);
                if (state) {
                    /* Update existing flow */
                    __sync_fetch_and_add(&state->packets, 1);
                    __sync_fetch_and_add(&state->bytes, data_end - data);
                    state->last_seen = bpf_ktime_get_ns();
                    
                    /* CPU redirect for better cache locality */
                    return bpf_redirect_map(&cpu_map, 
                                          bpf_get_smp_processor_id(), 0);
                }
            }
        }
    }
    
    /* Check against DDoS patterns */
    if (is_ddos_pattern(ip, data_end)) {
        if (stats)
            __sync_fetch_and_add(&stats->dropped_packets, 1);
        return XDP_DROP;
    }
    
    return XDP_PASS;
}

/* Helper function for rate limiting using token bucket */
static __always_inline bool check_rate_limit(__be32 src_ip)
{
    struct rate_limit *rl;
    __u64 now = bpf_ktime_get_ns();
    __u64 tokens_to_add;
    const __u64 rate = 10000;  /* 10k packets per second */
    const __u64 burst = 1000;   /* Burst of 1000 packets */
    
    rl = bpf_map_lookup_elem(&rate_limit_map, &src_ip);
    if (!rl) {
        /* New source, create rate limit entry */
        struct rate_limit new_rl = {
            .tokens = burst,
            .last_update = now
        };
        bpf_map_update_elem(&rate_limit_map, &src_ip, &new_rl, BPF_ANY);
        return true;
    }
    
    /* Calculate tokens to add based on time elapsed */
    tokens_to_add = (now - rl->last_update) * rate / 1000000000;
    rl->tokens = rl->tokens + tokens_to_add;
    if (rl->tokens > burst)
        rl->tokens = burst;
    
    rl->last_update = now;
    
    if (rl->tokens > 0) {
        rl->tokens--;
        return true;
    }
    
    return false;
}

/* DDoS pattern detection */
static __always_inline bool is_ddos_pattern(struct iphdr *ip, void *data_end)
{
    /* Check for common DDoS patterns */
    
    /* 1. IP fragment attacks */
    if (ip->frag_off & bpf_htons(IP_MF | IP_OFFSET))
        return true;
    
    /* 2. Small packet floods */
    if ((void *)ip + bpf_ntohs(ip->tot_len) < data_end - 64)
        return true;
    
    /* 3. Invalid TTL (spoofed packets often have low TTL) */
    if (ip->ttl < 5)
        return true;
    
    /* 4. TCP SYN floods */
    if (ip->protocol == IPPROTO_TCP) {
        struct tcphdr *tcp = (struct tcphdr *)((void *)ip + ip->ihl * 4);
        if ((void *)(tcp + 1) <= data_end) {
            /* SYN without ACK */
            if (tcp->syn && !tcp->ack)
                return true;
        }
    }
    
    return false;
}

/* TC egress program for packet manipulation and QoS */
SEC("tc/undertheradar_egress")
int tc_vpn_egress(struct __sk_buff *skb)
{
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;
    struct ethhdr *eth = data;
    struct iphdr *ip;
    
    if ((void *)(eth + 1) > data_end)
        return TC_ACT_OK;
    
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return TC_ACT_OK;
    
    ip = (struct iphdr *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return TC_ACT_OK;
    
    /* Apply DSCP marking for QoS */
    if (ip->protocol == IPPROTO_UDP) {
        struct udphdr *udp = (struct udphdr *)((void *)ip + ip->ihl * 4);
        if ((void *)(udp + 1) <= data_end) {
            /* VoIP traffic gets highest priority */
            if (udp->dest == bpf_htons(5060) || udp->dest == bpf_htons(5061)) {
                ip->tos = 0xb8;  /* EF (Expedited Forwarding) */
            }
            /* Gaming traffic gets high priority */
            else if (udp->dest >= bpf_htons(27000) && udp->dest <= bpf_htons(27100)) {
                ip->tos = 0x88;  /* AF41 */
            }
            /* VPN traffic gets medium priority */
            else if (udp->dest == bpf_htons(WIREGUARD_PORT)) {
                ip->tos = 0x68;  /* AF31 */
            }
        }
    }
    
    /* Implement packet pacing for better throughput */
    __u64 now = bpf_ktime_get_ns();
    __u64 delay = calculate_pacing_delay(skb->len);
    if (delay > 0) {
        skb->tstamp = now + delay;
    }
    
    return TC_ACT_OK;
}

/* Calculate pacing delay to smooth traffic */
static __always_inline __u64 calculate_pacing_delay(__u32 pkt_len)
{
    /* Target: 10 Gbps with microsecond precision */
    const __u64 target_bps = 10ULL * 1000 * 1000 * 1000;
    const __u64 ns_per_byte = 1000000000ULL * 8 / target_bps;
    
    return pkt_len * ns_per_byte;
}

/* CPU redirect map for RSS */
struct {
    __uint(type, BPF_MAP_TYPE_CPUMAP);
    __uint(max_entries, MAX_CPU);
    __type(key, __u32);
    __type(value, __u32);
} cpu_map SEC(".maps");

/* Program info */
char _license[] SEC("license") = "GPL";
__u32 _version SEC("version") = LINUX_VERSION_CODE;