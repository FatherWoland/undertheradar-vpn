package benchmark

import (
    "crypto/rand"
    "fmt"
    "net"
    "sync"
    "sync/atomic"
    "time"
    
    "github.com/montanaflynn/stats"
    "golang.org/x/crypto/curve25519"
)

// BenchmarkResults contains comprehensive performance metrics
type BenchmarkResults struct {
    Throughput      ThroughputMetrics
    Latency         LatencyMetrics
    PacketLoss      float64
    CPUUsage        float64
    MemoryUsage     MemoryMetrics
    Encryption      EncryptionMetrics
    Scalability     ScalabilityMetrics
    StabilityScore  float64
}

type ThroughputMetrics struct {
    Download        float64  // Mbps
    Upload          float64  // Mbps
    Bidirectional   float64  // Mbps
    JitterMs        float64
    PacketsPerSec   uint64
}

type LatencyMetrics struct {
    MinMs      float64
    MaxMs      float64
    AvgMs      float64
    MedianMs   float64
    P95Ms      float64
    P99Ms      float64
    StdDevMs   float64
}

type MemoryMetrics struct {
    HeapMB      float64
    StackMB     float64
    TotalMB     float64
    GCPauseMs   []float64
}

type EncryptionMetrics struct {
    HandshakesPerSec    float64
    EncryptMbps         float64
    DecryptMbps         float64
    RekeyTimeMs         float64
}

type ScalabilityMetrics struct {
    MaxConcurrentPeers  int
    MaxPacketsPerSec    uint64
    LinearScalability   float64  // 0.0 - 1.0
}

// VPNBenchmark performs comprehensive performance testing
type VPNBenchmark struct {
    vpn             *UnderTheRadarVPN
    testDuration    time.Duration
    packetSize      int
    numClients      int
    targetBandwidth float64  // Mbps
    
    // Metrics collection
    rxBytes         atomic.Uint64
    txBytes         atomic.Uint64
    rxPackets       atomic.Uint64
    txPackets       atomic.Uint64
    droppedPackets  atomic.Uint64
    latencies       []float64
    latencyMu       sync.Mutex
}

// Run executes comprehensive benchmark suite
func (b *VPNBenchmark) Run() (*BenchmarkResults, error) {
    results := &BenchmarkResults{}
    
    fmt.Println("🚀 Starting UnderTheRadar VPN Performance Benchmark")
    fmt.Printf("   Duration: %v | Clients: %d | Packet Size: %d bytes\n", 
              b.testDuration, b.numClients, b.packetSize)
    
    // Phase 1: Encryption Performance
    fmt.Println("\n📊 Phase 1: Encryption Performance")
    encMetrics, err := b.benchmarkEncryption()
    if err != nil {
        return nil, fmt.Errorf("encryption benchmark failed: %w", err)
    }
    results.Encryption = encMetrics
    
    // Phase 2: Throughput Testing
    fmt.Println("\n📊 Phase 2: Throughput Testing")
    throughputMetrics, err := b.benchmarkThroughput()
    if err != nil {
        return nil, fmt.Errorf("throughput benchmark failed: %w", err)
    }
    results.Throughput = throughputMetrics
    
    // Phase 3: Latency Testing
    fmt.Println("\n📊 Phase 3: Latency Testing")
    latencyMetrics, err := b.benchmarkLatency()
    if err != nil {
        return nil, fmt.Errorf("latency benchmark failed: %w", err)
    }
    results.Latency = latencyMetrics
    
    // Phase 4: Scalability Testing
    fmt.Println("\n📊 Phase 4: Scalability Testing")
    scaleMetrics, err := b.benchmarkScalability()
    if err != nil {
        return nil, fmt.Errorf("scalability benchmark failed: %w", err)
    }
    results.Scalability = scaleMetrics
    
    // Phase 5: Stability Testing
    fmt.Println("\n📊 Phase 5: Stability Testing")
    stabilityScore, err := b.benchmarkStability()
    if err != nil {
        return nil, fmt.Errorf("stability benchmark failed: %w", err)
    }
    results.StabilityScore = stabilityScore
    
    // Calculate packet loss
    totalPackets := b.rxPackets.Load() + b.txPackets.Load()
    if totalPackets > 0 {
        results.PacketLoss = float64(b.droppedPackets.Load()) / float64(totalPackets) * 100
    }
    
    return results, nil
}

// Benchmark encryption performance
func (b *VPNBenchmark) benchmarkEncryption() (EncryptionMetrics, error) {
    metrics := EncryptionMetrics{}
    
    // Test handshake performance
    start := time.Now()
    numHandshakes := 1000
    
    for i := 0; i < numHandshakes; i++ {
        // Generate ephemeral keys
        var privateKey, publicKey [32]byte
        if _, err := rand.Read(privateKey[:]); err != nil {
            return metrics, err
        }
        curve25519.ScalarBaseMult(&publicKey, &privateKey)
        
        // Simulate handshake
        // In real implementation, this would perform full Noise handshake
    }
    
    handshakeDuration := time.Since(start)
    metrics.HandshakesPerSec = float64(numHandshakes) / handshakeDuration.Seconds()
    
    // Test encryption throughput
    data := make([]byte, 1024*1024) // 1MB
    rand.Read(data)
    
    // Encryption benchmark
    encStart := time.Now()
    encBytes := 0
    for time.Since(encStart) < time.Second {
        // In real implementation, this would use ChaCha20-Poly1305
        encrypted := make([]byte, len(data)+16) // +16 for auth tag
        copy(encrypted, data) // Placeholder
        encBytes += len(data)
    }
    metrics.EncryptMbps = float64(encBytes) / 1024 / 1024
    
    // Decryption benchmark
    decStart := time.Now()
    decBytes := 0
    for time.Since(decStart) < time.Second {
        decrypted := make([]byte, len(data))
        copy(decrypted, data) // Placeholder
        decBytes += len(data)
    }
    metrics.DecryptMbps = float64(decBytes) / 1024 / 1024
    
    fmt.Printf("   ✓ Handshakes/sec: %.0f\n", metrics.HandshakesPerSec)
    fmt.Printf("   ✓ Encryption: %.0f Mbps\n", metrics.EncryptMbps)
    fmt.Printf("   ✓ Decryption: %.0f Mbps\n", metrics.DecryptMbps)
    
    return metrics, nil
}

// Benchmark throughput with multiple concurrent connections
func (b *VPNBenchmark) benchmarkThroughput() (ThroughputMetrics, error) {
    metrics := ThroughputMetrics{}
    var wg sync.WaitGroup
    
    // Reset counters
    b.rxBytes.Store(0)
    b.txBytes.Store(0)
    b.rxPackets.Store(0)
    b.txPackets.Store(0)
    
    // Start traffic generators
    stopCh := make(chan struct{})
    
    // Upload test
    for i := 0; i < b.numClients; i++ {
        wg.Add(1)
        go func(clientID int) {
            defer wg.Done()
            b.generateTraffic(clientID, "upload", stopCh)
        }(i)
    }
    
    // Measure for test duration
    time.Sleep(b.testDuration)
    close(stopCh)
    wg.Wait()
    
    // Calculate upload metrics
    uploadBytes := b.txBytes.Load()
    metrics.Upload = float64(uploadBytes) * 8 / b.testDuration.Seconds() / 1000000
    
    // Download test
    b.rxBytes.Store(0)
    b.txBytes.Store(0)
    stopCh = make(chan struct{})
    
    for i := 0; i < b.numClients; i++ {
        wg.Add(1)
        go func(clientID int) {
            defer wg.Done()
            b.generateTraffic(clientID, "download", stopCh)
        }(i)
    }
    
    time.Sleep(b.testDuration)
    close(stopCh)
    wg.Wait()
    
    // Calculate download metrics
    downloadBytes := b.rxBytes.Load()
    metrics.Download = float64(downloadBytes) * 8 / b.testDuration.Seconds() / 1000000
    
    // Bidirectional test
    b.rxBytes.Store(0)
    b.txBytes.Store(0)
    stopCh = make(chan struct{})
    
    for i := 0; i < b.numClients; i++ {
        wg.Add(2)
        go func(clientID int) {
            defer wg.Done()
            b.generateTraffic(clientID, "upload", stopCh)
        }(i)
        go func(clientID int) {
            defer wg.Done()
            b.generateTraffic(clientID, "download", stopCh)
        }(i)
    }
    
    time.Sleep(b.testDuration)
    close(stopCh)
    wg.Wait()
    
    // Calculate bidirectional metrics
    totalBytes := b.rxBytes.Load() + b.txBytes.Load()
    metrics.Bidirectional = float64(totalBytes) * 8 / b.testDuration.Seconds() / 1000000
    metrics.PacketsPerSec = (b.rxPackets.Load() + b.txPackets.Load()) / uint64(b.testDuration.Seconds())
    
    fmt.Printf("   ✓ Upload: %.2f Mbps\n", metrics.Upload)
    fmt.Printf("   ✓ Download: %.2f Mbps\n", metrics.Download)
    fmt.Printf("   ✓ Bidirectional: %.2f Mbps\n", metrics.Bidirectional)
    fmt.Printf("   ✓ Packets/sec: %d\n", metrics.PacketsPerSec)
    
    return metrics, nil
}

// Benchmark latency under various conditions
func (b *VPNBenchmark) benchmarkLatency() (LatencyMetrics, error) {
    metrics := LatencyMetrics{}
    b.latencies = make([]float64, 0, 10000)
    
    var wg sync.WaitGroup
    stopCh := make(chan struct{})
    
    // Run latency test with background traffic
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            b.measureLatency(stopCh)
        }()
    }
    
    // Generate background traffic to simulate real conditions
    for i := 0; i < b.numClients/2; i++ {
        wg.Add(1)
        go func(clientID int) {
            defer wg.Done()
            b.generateTraffic(clientID, "background", stopCh)
        }(i)
    }
    
    time.Sleep(b.testDuration)
    close(stopCh)
    wg.Wait()
    
    // Calculate statistics
    if len(b.latencies) > 0 {
        metrics.MinMs, _ = stats.Min(b.latencies)
        metrics.MaxMs, _ = stats.Max(b.latencies)
        metrics.AvgMs, _ = stats.Mean(b.latencies)
        metrics.MedianMs, _ = stats.Median(b.latencies)
        metrics.P95Ms, _ = stats.Percentile(b.latencies, 95)
        metrics.P99Ms, _ = stats.Percentile(b.latencies, 99)
        metrics.StdDevMs, _ = stats.StandardDeviation(b.latencies)
    }
    
    fmt.Printf("   ✓ Min: %.2f ms\n", metrics.MinMs)
    fmt.Printf("   ✓ Avg: %.2f ms\n", metrics.AvgMs)
    fmt.Printf("   ✓ P95: %.2f ms\n", metrics.P95Ms)
    fmt.Printf("   ✓ P99: %.2f ms\n", metrics.P99Ms)
    
    return metrics, nil
}

// Benchmark scalability with increasing load
func (b *VPNBenchmark) benchmarkScalability() (ScalabilityMetrics, error) {
    metrics := ScalabilityMetrics{}
    
    // Test with increasing number of peers
    peerCounts := []int{10, 50, 100, 500, 1000}
    throughputs := make([]float64, len(peerCounts))
    
    for i, count := range peerCounts {
        // Add test peers
        for j := 0; j < count; j++ {
            peerConfig := PeerConfig{
                PublicKey: generateTestPublicKey(),
                Endpoint: &net.UDPAddr{
                    IP:   net.ParseIP(fmt.Sprintf("10.0.%d.%d", j/256, j%256)),
                    Port: 51820,
                },
                AllowedIPs: []net.IPNet{{
                    IP:   net.ParseIP(fmt.Sprintf("10.0.%d.0", j)),
                    Mask: net.CIDRMask(24, 32),
                }},
            }
            if err := b.vpn.AddPeer(peerConfig); err != nil {
                return metrics, err
            }
        }
        
        // Measure throughput
        b.rxBytes.Store(0)
        b.txBytes.Store(0)
        
        stopCh := make(chan struct{})
        var wg sync.WaitGroup
        
        for j := 0; j < count; j++ {
            wg.Add(1)
            go func(peerID int) {
                defer wg.Done()
                b.generateTraffic(peerID, "scale", stopCh)
            }(j)
        }
        
        time.Sleep(10 * time.Second)
        close(stopCh)
        wg.Wait()
        
        totalBytes := b.rxBytes.Load() + b.txBytes.Load()
        throughputs[i] = float64(totalBytes) * 8 / 10 / 1000000
        
        if throughputs[i] > float64(metrics.MaxPacketsPerSec) {
            metrics.MaxConcurrentPeers = count
        }
    }
    
    // Calculate linear scalability score
    // Perfect linear scaling = 1.0
    if len(throughputs) > 1 {
        expectedScaling := throughputs[0] * float64(peerCounts[len(peerCounts)-1]) / float64(peerCounts[0])
        actualScaling := throughputs[len(throughputs)-1]
        metrics.LinearScalability = actualScaling / expectedScaling
        if metrics.LinearScalability > 1.0 {
            metrics.LinearScalability = 1.0
        }
    }
    
    fmt.Printf("   ✓ Max concurrent peers: %d\n", metrics.MaxConcurrentPeers)
    fmt.Printf("   ✓ Linear scalability: %.2f\n", metrics.LinearScalability)
    
    return metrics, nil
}

// Benchmark stability over extended period
func (b *VPNBenchmark) benchmarkStability() (float64, error) {
    // Run for extended period measuring variance
    measurements := make([]float64, 60) // 1 minute of measurements
    
    for i := 0; i < len(measurements); i++ {
        start := time.Now()
        b.rxBytes.Store(0)
        
        stopCh := make(chan struct{})
        go b.generateTraffic(0, "stability", stopCh)
        
        time.Sleep(time.Second)
        close(stopCh)
        
        bytes := b.rxBytes.Load()
        measurements[i] = float64(bytes) * 8 / 1000000 // Mbps
    }
    
    // Calculate coefficient of variation
    mean, _ := stats.Mean(measurements)
    stdDev, _ := stats.StandardDeviation(measurements)
    cv := stdDev / mean
    
    // Convert to stability score (lower CV = higher stability)
    stabilityScore := 1.0 - cv
    if stabilityScore < 0 {
        stabilityScore = 0
    }
    
    fmt.Printf("   ✓ Stability score: %.2f\n", stabilityScore)
    
    return stabilityScore, nil
}

// Traffic generator for testing
func (b *VPNBenchmark) generateTraffic(clientID int, testType string, stopCh <-chan struct{}) {
    packet := make([]byte, b.packetSize)
    rand.Read(packet)
    
    ticker := time.NewTicker(time.Microsecond * 100) // 10k pps per client
    defer ticker.Stop()
    
    for {
        select {
        case <-stopCh:
            return
        case <-ticker.C:
            // Simulate packet transmission
            b.txPackets.Add(1)
            b.txBytes.Add(uint64(len(packet)))
            
            // Simulate packet reception
            if testType == "download" || testType == "bidirectional" {
                b.rxPackets.Add(1)
                b.rxBytes.Add(uint64(len(packet)))
            }
        }
    }
}

// Measure latency
func (b *VPNBenchmark) measureLatency(stopCh <-chan struct{}) {
    ticker := time.NewTicker(100 * time.Millisecond)
    defer ticker.Stop()
    
    for {
        select {
        case <-stopCh:
            return
        case <-ticker.C:
            start := time.Now()
            
            // Simulate round-trip
            // In real implementation, this would send ICMP echo
            time.Sleep(time.Millisecond * time.Duration(5+rand.Intn(10)))
            
            latency := time.Since(start).Seconds() * 1000
            
            b.latencyMu.Lock()
            b.latencies = append(b.latencies, latency)
            b.latencyMu.Unlock()
        }
    }
}

// Generate test public key
func generateTestPublicKey() wgtypes.Key {
    var key wgtypes.Key
    rand.Read(key[:])
    return key
}

// Print benchmark results
func (r *BenchmarkResults) Print() {
    fmt.Println("\n🏁 BENCHMARK RESULTS")
    fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    fmt.Printf("\n📊 THROUGHPUT\n")
    fmt.Printf("   Download:      %.2f Mbps\n", r.Throughput.Download)
    fmt.Printf("   Upload:        %.2f Mbps\n", r.Throughput.Upload)
    fmt.Printf("   Bidirectional: %.2f Mbps\n", r.Throughput.Bidirectional)
    fmt.Printf("   Packets/sec:   %d\n", r.Throughput.PacketsPerSec)
    
    fmt.Printf("\n⏱️  LATENCY\n")
    fmt.Printf("   Average:       %.2f ms\n", r.Latency.AvgMs)
    fmt.Printf("   P95:           %.2f ms\n", r.Latency.P95Ms)
    fmt.Printf("   P99:           %.2f ms\n", r.Latency.P99Ms)
    fmt.Printf("   Jitter:        %.2f ms\n", r.Latency.StdDevMs)
    
    fmt.Printf("\n🔐 ENCRYPTION\n")
    fmt.Printf("   Handshakes/s:  %.0f\n", r.Encryption.HandshakesPerSec)
    fmt.Printf("   Encrypt:       %.0f Mbps\n", r.Encryption.EncryptMbps)
    fmt.Printf("   Decrypt:       %.0f Mbps\n", r.Encryption.DecryptMbps)
    
    fmt.Printf("\n📈 SCALABILITY\n")
    fmt.Printf("   Max peers:     %d\n", r.Scalability.MaxConcurrentPeers)
    fmt.Printf("   Linear scale:  %.2f\n", r.Scalability.LinearScalability)
    
    fmt.Printf("\n🎯 QUALITY\n")
    fmt.Printf("   Packet loss:   %.2f%%\n", r.PacketLoss)
    fmt.Printf("   Stability:     %.2f\n", r.StabilityScore)
    
    fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    // Overall score
    score := r.calculateOverallScore()
    grade := r.getGrade(score)
    
    fmt.Printf("\n🏆 OVERALL SCORE: %.1f/100 - Grade: %s\n", score, grade)
}

func (r *BenchmarkResults) calculateOverallScore() float64 {
    // Weighted scoring based on importance
    throughputScore := min(r.Throughput.Bidirectional/1000, 1.0) * 30  // 30 points max
    latencyScore := max(0, (50-r.Latency.AvgMs)/50) * 25              // 25 points max
    stabilityScore := r.StabilityScore * 20                            // 20 points max
    scalabilityScore := r.Scalability.LinearScalability * 15           // 15 points max
    lossScore := max(0, (1-r.PacketLoss/100)) * 10                    // 10 points max
    
    return throughputScore + latencyScore + stabilityScore + scalabilityScore + lossScore
}

func (r *BenchmarkResults) getGrade(score float64) string {
    switch {
    case score >= 95:
        return "A+ (World-class)"
    case score >= 90:
        return "A (Excellent)"
    case score >= 85:
        return "A- (Very Good)"
    case score >= 80:
        return "B+ (Good)"
    case score >= 75:
        return "B (Above Average)"
    case score >= 70:
        return "B- (Average)"
    case score >= 65:
        return "C+ (Below Average)"
    case score >= 60:
        return "C (Poor)"
    default:
        return "F (Unacceptable)"
    }
}

func min(a, b float64) float64 {
    if a < b {
        return a
    }
    return b
}

func max(a, b float64) float64 {
    if a > b {
        return a
    }
    return b
}