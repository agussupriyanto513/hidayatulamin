payment_fix_module = '''// ==========================================
// HIDAYATUL AMIN - PI PAYMENT FIX MODULE
// Versi: 1.0
// Deskripsi: Modul untuk menangani incomplete payment Pi Network
// ==========================================

class PiPaymentFix {
    constructor() {
        this.apiBaseUrl = window.location.origin.includes('localhost') 
            ? 'http://localhost:3000/api' 
            : 'https://hidayatulamin.vercel.app/api';
        this.pendingPayments = [];
        this.init();
    }

    // ==========================================
    // INISIALISASI
    // ==========================================
    
    async init() {
        // Load pending payments dari localStorage
        this.loadPendingPayments();
        
        // Setup event listener untuk incomplete payment
        this.setupIncompletePaymentHandler();
        
        // Cek payment yang pending saat load
        await this.checkPendingPayments();
        
        console.log('✅ PiPaymentFix initialized');
    }

    // ==========================================
    // 1. HANDLE INCOMPLETE PAYMENT FOUND
    // ==========================================

    setupIncompletePaymentHandler() {
        // Override global onIncompletePaymentFound
        window.onIncompletePaymentFound = async (payment) => {
            console.log('⚠️ Incomplete payment found:', payment);
            
            // Simpan ke localStorage
            this.savePendingPayment(payment);
            
            // Coba resume payment
            await this.resumePayment(payment);
            
            return Promise.resolve();
        };
    }

    // ==========================================
    // 2. SAVE PENDING PAYMENT
    // ==========================================

    savePendingPayment(payment) {
        const existing = this.pendingPayments.find(p => p.identifier === payment.identifier);
        
        if (!existing) {
            this.pendingPayments.push({
                identifier: payment.identifier,
                amount: payment.amount,
                memo: payment.memo,
                metadata: payment.metadata,
                status: 'incomplete',
                createdAt: new Date().toISOString()
            });
            
            this.saveToStorage();
            console.log('💾 Pending payment saved:', payment.identifier);
        }
    }

    // ==========================================
    // 3. LOAD PENDING PAYMENTS
    // ==========================================

    loadPendingPayments() {
        const stored = localStorage.getItem('pi_pending_payments');
        if (stored) {
            this.pendingPayments = JSON.parse(stored);
            console.log('📂 Loaded pending payments:', this.pendingPayments.length);
        }
    }

    saveToStorage() {
        localStorage.setItem('pi_pending_payments', JSON.stringify(this.pendingPayments));
    }

    // ==========================================
    // 4. CHECK PENDING PAYMENTS
    // ==========================================

    async checkPendingPayments() {
        if (this.pendingPayments.length === 0) return;
        
        console.log('🔍 Checking pending payments...');
        
        for (const payment of this.pendingPayments) {
            if (payment.status === 'incomplete') {
                await this.checkPaymentStatus(payment);
            }
        }
    }

    // ==========================================
    // 5. CHECK PAYMENT STATUS via API
    // ==========================================

    async checkPaymentStatus(payment) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/pi/check-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId: payment.identifier })
            });
            
            const result = await response.json();
            
            if (result.status === 'completed') {
                // Payment sudah complete, update status
                payment.status = 'completed';
                payment.txid = result.txid;
                this.saveToStorage();
                
                console.log('✅ Payment completed:', payment.identifier);
                
                // Trigger event
                this.dispatchPaymentEvent('completed', payment);
                
            } else if (result.status === 'pending') {
                // Masih pending, coba resume
                await this.resumePayment(payment);
            }
            
        } catch (error) {
            console.error('❌ Error checking payment:', error);
        }
    }

    // ==========================================
    // 6. RESUME INCOMPLETE PAYMENT
    // ==========================================

    async resumePayment(payment) {
        console.log('🔄 Resuming payment:', payment.identifier);
        
        try {
            // Cek apakah Pi SDK tersedia
            if (typeof Pi === 'undefined') {
                console.warn('⚠️ Pi SDK not available');
                return;
            }
            
            // Coba complete payment via server
            await this.serverCompletePayment(payment);
            
        } catch (error) {
            console.error('❌ Error resuming payment:', error);
        }
    }

    // ==========================================
    // 7. SERVER COMPLETE PAYMENT
    // ==========================================

    async serverCompletePayment(payment) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/pi/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId: payment.identifier,
                    txid: payment.txid || null
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                payment.status = 'completed';
                payment.txid = result.txid;
                this.saveToStorage();
                
                console.log('✅ Payment completed via server');
                this.dispatchPaymentEvent('completed', payment);
                
                // Redirect jika ada redirectUrl
                if (payment.metadata?.redirectUrl) {
                    window.location.href = payment.metadata.redirectUrl;
                }
            }
            
        } catch (error) {
            console.error('❌ Server complete error:', error);
        }
    }

    // ==========================================
    // 8. CANCEL PAYMENT
    // ==========================================

    async cancelPayment(paymentId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/pi/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId: paymentId })
            });
            
            // Remove from pending
            this.pendingPayments = this.pendingPayments.filter(p => p.identifier !== paymentId);
            this.saveToStorage();
            
            console.log('🗑️ Payment cancelled:', paymentId);
            
        } catch (error) {
            console.error('❌ Cancel payment error:', error);
        }
    }

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    dispatchPaymentEvent(type, payment) {
        window.dispatchEvent(new CustomEvent('piPaymentUpdate', {
            detail: { type, payment }
        }));
    }

    getPendingPayments() {
        return this.pendingPayments.filter(p => p.status === 'incomplete');
    }

    clearCompletedPayments() {
        this.pendingPayments = this.pendingPayments.filter(p => p.status !== 'completed');
        this.saveToStorage();
    }

    // ==========================================
    // INTEGRATION HELPER
    // ==========================================

    static integrateWithExistingPayment(paymentConfig) {
        const fix = new PiPaymentFix();
        
        // Wrap callbacks untuk handle incomplete payment
        const originalOnReadyForServerApproval = paymentConfig.onReadyForServerApproval;
        const originalOnReadyForServerCompletion = paymentConfig.onReadyForServerCompletion;
        
        paymentConfig.onReadyForServerApproval = async (paymentId) => {
            // Simpan payment info
            fix.savePendingPayment({
                identifier: paymentId,
                status: 'pending_approval'
            });
            
            // Call original callback
            if (originalOnReadyForServerApproval) {
                await originalOnReadyForServerApproval(paymentId);
            }
        };
        
        paymentConfig.onReadyForServerCompletion = async (paymentId, txid) => {
            // Update status
            const payment = fix.pendingPayments.find(p => p.identifier === paymentId);
            if (payment) {
                payment.status = 'completed';
                payment.txid = txid;
                fix.saveToStorage();
            }
            
            // Call original callback
            if (originalOnReadyForServerCompletion) {
                await originalOnReadyForServerCompletion(paymentId, txid);
            }
        };
        
        return paymentConfig;
    }
}

// ==========================================
// GLOBAL INSTANCE
// ==========================================

// Auto-initialize
let piPaymentFix = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize hanya jika Pi SDK tersedia
    if (typeof Pi !== 'undefined') {
        piPaymentFix = new PiPaymentFix();
        window.piPaymentFix = piPaymentFix;
    }
});

// Export untuk module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PiPaymentFix;
}