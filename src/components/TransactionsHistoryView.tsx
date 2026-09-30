import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../types';
import {
  Receipt,
  Search,
  Printer,
  Download,
  Share2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { exportOrdersCsv } from '../utils/csvExport';

interface TransactionsHistoryViewProps {
  onOpenReceipt: (order: Order) => void;
}

export const TransactionsHistoryView: React.FC<TransactionsHistoryViewProps> = ({
  onOpenReceipt,
}) => {
  const { orders, voidOrder, addNotification, runWithExportLoading } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'voided'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Void modal state
  const [voidModalOrder, setVoidModalOrder] = useState<Order | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [voidError, setVoidError] = useState('');

  // Filtering
  const filteredOrders = orders.filter((o) => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchMethod = methodFilter === 'all' || o.paymentMethod === methodFilter;
    const matchSearch =
      o.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerPhone && o.customerPhone.includes(searchQuery));
    return matchStatus && matchMethod && matchSearch;
  });

  const totalOmzet = orders
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + o.grandTotal, 0);

  const handleExportCsv = async () => {
    await runWithExportLoading(
      {
        title: 'Mengekspor Riwayat Transaksi (.CSV)...',
        subtitle: 'Mengalkulasi subtotal nota, diskon, PPN, dan menyusun file spreadsheet Excel...',
        type: 'csv',
      },
      () => {
        exportOrdersCsv(orders);
      }
    );
    addNotification('Riwayat transaksi berhasil diekspor ke Excel CSV.', 'success');
  };

  const handleVoidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalOrder) return;
    if (!voidReason.trim()) {
      setVoidError('Alasan pembatalan (void) wajib diisi.');
      return;
    }
    if (!adminPin.trim()) {
      setVoidError('PIN Administrator / Supervisor wajib diisi.');
      return;
    }

    const res = voidOrder(voidModalOrder.id, voidReason.trim(), adminPin);
    if (!res.success) {
      setVoidError(res.message || 'Gagal membatalkan transaksi.');
    } else {
      setVoidModalOrder(null);
      setVoidReason('');
      setAdminPin('');
      setVoidError('');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d1017] p-3 sm:p-5 space-y-4">
      {/* Top Banner & Summary */}
      <div className="bg-[#121622] p-4 rounded-2xl border border-[#212738] flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div>
          <h2 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-rose-400" />
            <span>Riwayat Transaksi & Struk Kasir</span>
          </h2>
          <p className="text-xs text-slate-400">
            Pencarian nota pembayaran, cetak ulang struk (reprint), dan pembatalan transaksi (VOID).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-semibold">Total Omzet Bersih</span>
            <span className="font-mono font-black text-sm sm:text-base text-emerald-400">
              Rp {totalOmzet.toLocaleString('id-ID')}
            </span>
          </div>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-[#1a2030] hover:bg-[#232b40] border border-[#273248] text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Ekspor Excel (.CSV)</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor nota, invoice, atau nama pelanggan..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#161a26] border border-[#222a3d] text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-rose-500"
          />
        </div>

        <div className="flex gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-[#161a26] border border-[#222a3d] text-white text-xs font-bold outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="completed">Sukses (Lunas)</option>
            <option value="voided">Dibatalkan (VOID)</option>
          </select>

          {/* Payment Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#161a26] border border-[#222a3d] text-white text-xs font-bold outline-none"
          >
            <option value="all">Semua Pembayaran</option>
            <option value="Cash">Tunai (Cash)</option>
            <option value="QRIS">QRIS</option>
            <option value="Debit">Debit</option>
            <option value="Kredit">Kredit</option>
            <option value="Transfer_BCA">BCA</option>
            <option value="Transfer_Mandiri">Mandiri</option>
          </select>
        </div>
      </div>

      {/* Orders Table Container */}
      <div className="flex-1 bg-[#121622] rounded-2xl border border-[#212738] overflow-y-auto shadow-md">
        {filteredOrders.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500">
            <Receipt className="w-12 h-12 mb-2 opacity-30 text-slate-400" />
            <p className="font-bold text-sm text-slate-300">Tidak ada riwayat transaksi</p>
            <p className="text-xs text-slate-400">Sesuaikan filter status atau kata kunci pencarian</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e2436]">
            {filteredOrders.map((ord) => {
              const isVoided = ord.status === 'voided';
              return (
                <div
                  key={ord.id}
                  className={`p-4 hover:bg-[#161a28] transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                    isVoided ? 'opacity-60 bg-rose-950/10' : ''
                  }`}
                >
                  {/* Left: Invoice & Customer Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white bg-[#191f2e] px-2 py-0.5 rounded border border-[#273248]">
                        {ord.invoiceNumber}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{ord.date}</span>
                      <span
                        className={`font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isVoided
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {isVoided ? 'DIBATALKAN (VOID)' : 'SUKSES'}
                      </span>
                    </div>

                    <h4 className="font-extrabold text-sm text-white">
                      {ord.customerName}{' '}
                      {ord.customerPhone && (
                        <span className="text-xs font-normal text-slate-400">({ord.customerPhone})</span>
                      )}
                    </h4>

                    <p className="text-slate-400 line-clamp-1">
                      {ord.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
                    </p>

                    {isVoided && (
                      <p className="text-[11px] text-rose-400 italic">
                        Alasan Void: {ord.voidReason} (oleh {ord.voidedBy})
                      </p>
                    )}
                  </div>

                  {/* Right: Amounts & Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-[#1e2436]">
                    <div className="text-left md:text-right">
                      <span className="text-[10px] text-slate-400 block font-semibold">
                        Metode: {ord.paymentMethod}
                      </span>
                      <span
                        className={`font-black text-base font-mono ${
                          isVoided ? 'line-through text-slate-500' : 'text-rose-400'
                        }`}
                      >
                        Rp {ord.grandTotal.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[10px] text-slate-400 block">Kasir: {ord.cashierName}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Reprint Receipt */}
                      <button
                        onClick={() => onOpenReceipt(ord)}
                        className="p-2 rounded-xl bg-[#1c2232] hover:bg-[#252e42] border border-[#29354d] text-slate-200 transition cursor-pointer"
                        title="Cetak Ulang Struk (Reprint)"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Void Button (if not already voided) */}
                      {!isVoided && (
                        <button
                          onClick={() => {
                            setVoidModalOrder(ord);
                            setVoidReason('');
                            setAdminPin('');
                            setVoidError('');
                          }}
                          className="p-2 rounded-xl bg-[#281318] hover:bg-rose-900/40 border border-rose-900/60 text-rose-400 transition cursor-pointer"
                          title="Batalkan Transaksi (VOID & Retur Stok)"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VOID CONFIRMATION MODAL */}
      {voidModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-[#141824] rounded-3xl p-6 border border-rose-900/60 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-950/60 flex items-center justify-center border border-rose-800">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Otorisasi Pembatalan (VOID)</h3>
                <span className="text-xs text-rose-300 font-mono font-bold">
                  {voidModalOrder.invoiceNumber}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Pembatalan transaksi akan mengembalikan seluruh stok produk ke gudang dan mencatat transaksi penarikan kas pada shift aktif.
            </p>

            {voidError && (
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 font-semibold">
                {voidError}
              </div>
            )}

            <form onSubmit={handleVoidSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Alasan Pembatalan Transaksi *
                </label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Cth: Salah input item, Pelanggan membatalkan pesanan..."
                  className="w-full p-2.5 rounded-xl bg-[#191f2e] border border-[#273248] text-white outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>PIN Otorisasi Administrator / Supervisor *</span>
                </label>
                <input
                  type="password"
                  required
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Masukkan PIN Admin (hairi21)..."
                  className="w-full p-2.5 rounded-xl bg-[#191f2e] border border-[#273248] text-white font-mono outline-none focus:ring-1 focus:ring-rose-500 tracking-widest"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidModalOrder(null)}
                  className="flex-1 py-2.5 rounded-xl bg-[#20273a] text-slate-300 font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-bold shadow-md shadow-rose-950/40"
                >
                  Konfirmasi VOID
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
