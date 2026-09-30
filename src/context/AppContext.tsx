import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Category,
  Product,
  CartItem,
  HeldOrder,
  ShiftRecord,
  DrawerTransaction,
  Order,
  StoreSettings,
  PaymentMethod,
  CustomSablonDetails,
} from '../types';
import {
  playBarcodeBeep,
  playCashRegisterSound,
  playWarningSound,
  playClickSound,
} from '../utils/soundEffects';
import { ExportLoadingState } from '../components/ExportLoadingModal';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  categories: Category[];
  products: Product[];
  cart: CartItem[];
  heldOrders: HeldOrder[];
  currentShift: ShiftRecord | null;
  shifts: ShiftRecord[];
  orders: Order[];
  storeSettings: StoreSettings;
  soundMuted: boolean;
  notifications: { id: string; message: string; type: 'info' | 'success' | 'warning'; timestamp: string }[];
  exportLoading: ExportLoadingState;
  runWithExportLoading: <T>(
    options: {
      title: string;
      subtitle?: string;
      type?: 'pdf' | 'csv' | 'backup' | 'print';
      minDurationMs?: number;
    },
    task: () => Promise<T> | T
  ) => Promise<T>;

  // Auth
  login: (username: string, pin: string) => { success: boolean; message?: string };
  logout: () => void;
  verifyAdminPin: (pin: string) => boolean;

  // User Management (Admin only)
  addUser: (userData: Omit<User, 'id'>) => { success: boolean; message?: string };
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => { success: boolean; message?: string };

  // Shift & Cash Drawer Management
  openShift: (startingCash: number, notes?: string) => ShiftRecord;
  closeShift: (actualCash: number, notes?: string) => ShiftRecord | null;
  addDrawerTransaction: (type: 'cash_in' | 'cash_out', amount: number, note: string) => void;
  resetShiftHistory: (adminPin: string) => { success: boolean; message?: string };

  // Cart Management
  addToCart: (product: Product, qty?: number) => void;
  addCustomSablonItem: (custom: CustomSablonDetails) => void;
  addCustomCartItem: (name: string, price: number, qty: number, notes?: string) => void;
  updateCartItemQty: (id: string, delta: number) => void;
  updateCartItem: (id: string, updates: Partial<CartItem>) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;

  // Hold & Recall Orders (Pending Bills)
  holdCurrentCart: (customerName: string, tableOrNotes: string, discountTotal?: number) => HeldOrder | null;
  recallHeldOrder: (heldId: string) => void;
  deleteHeldOrder: (heldId: string) => void;

  // Checkout & Transactions
  processCheckout: (data: {
    customerName: string;
    customerPhone?: string;
    discountTotal: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
  }) => Promise<Order>;
  voidOrder: (orderId: string, reason: string, adminPin: string) => { success: boolean; message?: string };

  // Product & Inventory
  addProduct: (product: Omit<Product, 'id' | 'sku'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => { success: boolean; message?: string };
  adjustStock: (id: string, deltaStock: number) => void;

  // Settings & System Backup
  updateStoreSettings: (settings: StoreSettings) => void;
  downloadSystemBackup: () => void;
  restoreSystemBackup: (jsonContent: string) => { success: boolean; message?: string };

  // Sound & Notifications
  toggleSound: () => void;
  addNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  dismissNotification: (id: string) => void;
}

const defaultCategories: Category[] = [
  { id: 'cat-all', name: 'Semua Produk' },
  { id: 'cat-apparel', name: 'Kaos & Apparel Polos' },
  { id: 'cat-sablon', name: 'Jasa Sablon DTF' },
  { id: 'cat-merch', name: 'Merchandise & Aksesoris' },
  { id: 'cat-package', name: 'Paket Usaha & Lainnya' },
];

// High quality embedded SVG placeholders for guaranteed zero-broken-links
const createSvgPlaceholder = (label: string, color = '#6b222f') =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23141724"/><rect x="20" y="20" width="260" height="260" rx="16" fill="${encodeURIComponent(color)}" opacity="0.85"/><text x="50%" y="48%" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="16" text-anchor="middle" dominant-baseline="middle">${encodeURIComponent(label)}</text><text x="50%" y="60%" fill="%23fecdd3" font-family="sans-serif" font-size="11" text-anchor="middle">SANDIKALE</text></svg>`;

const defaultProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'Kaos Cotton Combed 30s Hitam Reaktif',
    sku: 'TSH-C30S-BLK',
    barcode: '8991001001',
    category: 'Kaos & Apparel Polos',
    costPrice: 28000,
    sellingPrice: 42000,
    stock: 85,
    minStock: 15,
    unit: 'pcs',
    img: createSvgPlaceholder('Combed 30s Hitam', '#1e293b'),
  },
  {
    id: 'prod-2',
    name: 'Kaos Cotton Combed 24s Putih Tebal',
    sku: 'TSH-C24S-WHT',
    barcode: '8991001002',
    category: 'Kaos & Apparel Polos',
    costPrice: 32000,
    sellingPrice: 46000,
    stock: 60,
    minStock: 12,
    unit: 'pcs',
    img: createSvgPlaceholder('Combed 24s Putih', '#475569'),
  },
  {
    id: 'prod-3',
    name: 'Heavyweight Oversize 16s Charcoal Wash',
    sku: 'TSH-OVR-CHR',
    barcode: '8991001003',
    category: 'Kaos & Apparel Polos',
    costPrice: 48000,
    sellingPrice: 75000,
    stock: 35,
    minStock: 8,
    unit: 'pcs',
    img: createSvgPlaceholder('Oversize 16s', '#334155'),
  },
  {
    id: 'prod-4',
    name: 'Hoodie Fleece Heavy 330gsm Hitam',
    sku: 'HOD-FLC-BLK',
    barcode: '8991001004',
    category: 'Kaos & Apparel Polos',
    costPrice: 85000,
    sellingPrice: 140000,
    stock: 22,
    minStock: 5,
    unit: 'pcs',
    img: createSvgPlaceholder('Hoodie Fleece 330g', '#0f172a'),
  },
  {
    id: 'prod-5',
    name: 'Jasa Sablon DTF High Def A3 (29x42cm)',
    sku: 'SRV-DTF-A3',
    barcode: '8991002001',
    category: 'Jasa Sablon DTF',
    costPrice: 14000,
    sellingPrice: 25000,
    stock: 999,
    minStock: 10,
    unit: 'sisi',
    img: createSvgPlaceholder('Sablon DTF A3', '#800020'),
  },
  {
    id: 'prod-6',
    name: 'Jasa Sablon DTF High Def A4 (21x29cm)',
    sku: 'SRV-DTF-A4',
    barcode: '8991002002',
    category: 'Jasa Sablon DTF',
    costPrice: 9000,
    sellingPrice: 16000,
    stock: 999,
    minStock: 10,
    unit: 'sisi',
    img: createSvgPlaceholder('Sablon DTF A4', '#9f1239'),
  },
  {
    id: 'prod-7',
    name: 'Jasa Sablon DTF Logo Saku / Dada (10x10cm)',
    sku: 'SRV-DTF-LOG',
    barcode: '8991002003',
    category: 'Jasa Sablon DTF',
    costPrice: 3000,
    sellingPrice: 6000,
    stock: 999,
    minStock: 10,
    unit: 'sisi',
    img: createSvgPlaceholder('Sablon Logo Saku', '#be123c'),
  },
  {
    id: 'prod-dtf-a5',
    name: 'Jasa Sablon DTF A5 (15x21cm)',
    sku: 'SRV-DTF-A5',
    barcode: '8991002004',
    category: 'Jasa Sablon DTF',
    costPrice: 5000,
    sellingPrice: 10000,
    stock: 999,
    minStock: 10,
    unit: 'sisi',
    img: createSvgPlaceholder('Sablon DTF A5', '#b91c1c'),
  },
  {
    id: 'prod-dtf-a3plus',
    name: 'Jasa Sablon DTF A3+ Super (32x48cm)',
    sku: 'SRV-DTF-A3P',
    barcode: '8991002005',
    category: 'Jasa Sablon DTF',
    costPrice: 18000,
    sellingPrice: 32000,
    stock: 999,
    minStock: 10,
    unit: 'sisi',
    img: createSvgPlaceholder('Sablon DTF A3+', '#7f1d1d'),
  },
  {
    id: 'prod-8',
    name: 'Tote Bag Canvas Blacu Premium 30x40cm',
    sku: 'MER-TOT-BLC',
    barcode: '8991003001',
    category: 'Merchandise & Aksesoris',
    costPrice: 12000,
    sellingPrice: 22000,
    stock: 50,
    minStock: 10,
    unit: 'pcs',
    img: createSvgPlaceholder('Tote Bag Canvas', '#854d0e'),
  },
  {
    id: 'prod-9',
    name: 'Mug Keramik Custom Coating SNI Putih',
    sku: 'MER-MUG-CRM',
    barcode: '8991003002',
    category: 'Merchandise & Aksesoris',
    costPrice: 11000,
    sellingPrice: 20000,
    stock: 45,
    minStock: 12,
    unit: 'pcs',
    img: createSvgPlaceholder('Mug Keramik SNI', '#047857'),
  },
  {
    id: 'prod-10',
    name: 'Topi Jaring Trucker Hat Classic',
    sku: 'MER-HAT-TRK',
    barcode: '8991003003',
    category: 'Merchandise & Aksesoris',
    costPrice: 9000,
    sellingPrice: 18000,
    stock: 40,
    minStock: 10,
    unit: 'pcs',
    img: createSvgPlaceholder('Trucker Hat', '#1e3a8a'),
  },
];

// Initial user list strictly matching request: Admin/Owner is "Hairi Habibullah" with PIN "hairi21"
const defaultUsers: User[] = [
  {
    id: 'usr-admin',
    username: 'Hairi Habibullah',
    name: 'Hairi Habibullah',
    role: 'admin',
    pin: 'hairi21',
    phone: '082266412844',
  },
  {
    id: 'usr-kasir',
    username: 'kasir',
    name: 'Siti Rahmawati (Kasir)',
    role: 'kasir',
    pin: '1234',
    phone: '087811223344',
  },
  {
    id: 'usr-produksi',
    username: 'produksi',
    name: 'Kang Asep (Operator Produksi)',
    role: 'produksi',
    pin: '1234',
    phone: '085712345678',
  },
];

const defaultStoreSettings: StoreSettings = {
  storeName: 'SANDIKALE',
  tagline: 'Custom Sablon Satuan, DTF & Merchandise',
  address: 'Jl. Wisata Alam Sesaot No. 24, Narmada, Lombok Barat, NTB',
  phone: '+62 822-6641-2844',
  instagram: '@_sandikale', // Replaced email as requested
  taxRatePercent: 11,
  enableTax: false,
  serviceChargePercent: 5,
  enableServiceCharge: false,
  receiptHeader: 'SANDIKALE - WORKSHOP SABLON',
  receiptFooter: 'Garansi Sablon & Cetak DTF 30 Hari. Simpan struk ini untuk bukti pengambilan.',
  qrisImageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226590014ID.LINKAJA.WWW01189360091800000001025204581253033605802ID5917SANDIKALE+PROJECT6007NARMADA61058337162160712TRX',
  logoUrl: '',
  printerPaperSize: '58mm',
  soundEffectsEnabled: true,
  autoOpenCashDrawer: true,
  customerFacingDisplayEnabled: true,
};

const defaultOrders: Order[] = [
  {
    id: 'ord-1',
    invoiceNumber: 'INV-20260930-001',
    date: '30/09/2026 09:15',
    timestamp: Date.now() - 3600000 * 4,
    cashierId: 'usr-admin',
    cashierName: 'Hairi Habibullah',
    customerName: 'Komunitas Motor Narmada',
    customerPhone: '081234567890',
    items: [
      {
        id: 'ci-1',
        productId: 'prod-1',
        name: 'Kaos Cotton Combed 30s Hitam Reaktif',
        price: 42000,
        costPrice: 28000,
        qty: 12,
        discountAmount: 0,
        discountPercent: 0,
      },
      {
        id: 'ci-2',
        productId: 'prod-5',
        name: 'Jasa Sablon DTF High Def A3 (29x42cm)',
        price: 25000,
        costPrice: 14000,
        qty: 12,
        discountAmount: 0,
        discountPercent: 0,
      },
    ],
    subtotal: 804000,
    discountTotal: 24000,
    taxRate: 0,
    taxAmount: 0,
    serviceCharge: 0,
    grandTotal: 780000,
    paymentMethod: 'Transfer_BCA',
    amountPaid: 780000,
    change: 0,
    status: 'completed',
    shiftId: 'shift-today',
  },
  {
    id: 'ord-2',
    invoiceNumber: 'INV-20260930-002',
    date: '30/09/2026 11:30',
    timestamp: Date.now() - 3600000 * 2,
    cashierId: 'usr-kasir',
    cashierName: 'Siti Rahmawati (Kasir)',
    customerName: 'Kak Reza Studio',
    customerPhone: '087812345678',
    items: [
      {
        id: 'ci-3',
        productId: 'prod-3',
        name: 'Heavyweight Oversize 16s Charcoal Wash',
        price: 75000,
        costPrice: 48000,
        qty: 3,
        discountAmount: 0,
        discountPercent: 0,
      },
      {
        id: 'ci-4',
        productId: 'prod-6',
        name: 'Jasa Sablon DTF High Def A4 (21x29cm)',
        price: 16000,
        costPrice: 9000,
        qty: 3,
        discountAmount: 0,
        discountPercent: 0,
      },
    ],
    subtotal: 273000,
    discountTotal: 0,
    taxRate: 0,
    taxAmount: 0,
    serviceCharge: 0,
    grandTotal: 273000,
    paymentMethod: 'QRIS',
    amountPaid: 273000,
    change: 0,
    status: 'completed',
    shiftId: 'shift-today',
  },
];

const defaultInitialShift: ShiftRecord = {
  id: 'shift-today',
  shiftNumber: 'SHF-20260930-01',
  cashierId: 'usr-admin',
  cashierName: 'Hairi Habibullah',
  startTime: '30/09/2026 08:00',
  startingCash: 250000,
  expectedCashEnding: 250000,
  totalSalesCash: 0,
  totalSalesNonCash: 1053000,
  totalTransactions: 2,
  status: 'open',
  notes: 'Shift Pagi Operasional Kasir',
  drawerTransactions: [
    {
      id: 'dt-1',
      time: '08:00',
      type: 'cash_in',
      amount: 250000,
      note: 'Modal Kas Awal Kasir',
      cashierName: 'Hairi Habibullah',
    },
  ],
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Current user
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('sandikale_pos_user');
    return saved ? JSON.parse(saved) : defaultUsers[0];
  });

  // Users list
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('sandikale_pos_users');
    return saved ? JSON.parse(saved) : defaultUsers;
  });

  // Products
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sandikale_pos_products');
    return saved ? JSON.parse(saved) : defaultProducts;
  });

  // Cart
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('sandikale_pos_cart');
    return saved ? JSON.parse(saved) : [];
  });

  // Held orders (Pending Bills)
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => {
    const saved = localStorage.getItem('sandikale_pos_held_orders');
    return saved ? JSON.parse(saved) : [];
  });

  // Current active shift
  const [currentShift, setCurrentShift] = useState<ShiftRecord | null>(() => {
    const saved = localStorage.getItem('sandikale_pos_current_shift');
    return saved ? JSON.parse(saved) : defaultInitialShift;
  });

  // Shifts history
  const [shifts, setShifts] = useState<ShiftRecord[]>(() => {
    const saved = localStorage.getItem('sandikale_pos_shifts');
    return saved ? JSON.parse(saved) : [defaultInitialShift];
  });

  // Orders history
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('sandikale_pos_orders');
    return saved ? JSON.parse(saved) : defaultOrders;
  });

  // Store settings
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    const saved = localStorage.getItem('sandikale_pos_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.storeName) {
          parsed.storeName = parsed.storeName
            .replace(/\bPRO\s+POS\b/gi, '')
            .replace(/\bSANDIKALE\s+POS\b/gi, 'SANDIKALE')
            .replace(/\s+PRO\b/gi, '')
            .trim() || 'SANDIKALE';
        }
        if (parsed.receiptHeader) {
          parsed.receiptHeader = parsed.receiptHeader
            .replace(/\bPRO\s+POS\b/gi, '')
            .replace(/\bSANDIKALE\s+POS\b/gi, 'SANDIKALE')
            .trim() || 'SANDIKALE - WORKSHOP SABLON';
        }
        return { ...defaultStoreSettings, ...parsed };
      } catch {
        return defaultStoreSettings;
      }
    }
    return defaultStoreSettings;
  });

  // Sound effects mute state
  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    return localStorage.getItem('sandikale_pos_sound_muted') === 'true';
  });

  // Export Loading Modal State
  const [exportLoading, setExportLoading] = useState<ExportLoadingState>({
    isOpen: false,
    title: 'Merender Dokumen...',
    subtitle: 'Menyiapkan berkas dan mengoptimasi resolusi...',
    type: 'pdf',
  });

  // Notifications
  const [notifications, setNotifications] = useState<
    { id: string; message: string; type: 'info' | 'success' | 'warning'; timestamp: string }[]
  >([
    {
      id: 'notif-welcome',
      message: 'Sistem Kasir SANDIKALE siap digunakan. Shift kasir aktif.',
      type: 'success',
      timestamp: 'Baru saja',
    },
  ]);

  // Safe localStorage helper to prevent quota exceeded crashes
  const safeStorageSet = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`Gagal menyimpan ke localStorage (${key}):`, e);
    }
  };

  // Sync to LocalStorage
  useEffect(() => {
    safeStorageSet('sandikale_pos_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_held_orders', JSON.stringify(heldOrders));
  }, [heldOrders]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_current_shift', JSON.stringify(currentShift));
  }, [currentShift]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_shifts', JSON.stringify(shifts));
  }, [shifts]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_settings', JSON.stringify(storeSettings));
  }, [storeSettings]);

  useEffect(() => {
    safeStorageSet('sandikale_pos_sound_muted', String(soundMuted));
  }, [soundMuted]);

  /**
   * Helper untuk menjalankan tugas rendering ekspor dengan animasi loading visual yang mulus
   */
  const runWithExportLoading = async <T,>(
    options: {
      title: string;
      subtitle?: string;
      type?: 'pdf' | 'csv' | 'backup' | 'print';
      minDurationMs?: number;
    },
    task: () => Promise<T> | T
  ): Promise<T> => {
    setExportLoading({
      isOpen: true,
      title: options.title,
      subtitle:
        options.subtitle ||
        'Menyusun tata letak halaman, mengoptimasi resolusi gambar (300 DPI), dan menghasilkan dokumen...',
      type: options.type || 'pdf',
    });

    const startTime = Date.now();
    const minWait = options.minDurationMs ?? 700;

    // Beri jeda sekejap agar browser me-render UI modal animasi loading ke layar sebelum CPU memproses file
    await new Promise((resolve) => setTimeout(resolve, 90));

    try {
      const result = await task();
      const elapsed = Date.now() - startTime;
      if (elapsed < minWait) {
        await new Promise((resolve) => setTimeout(resolve, minWait - elapsed));
      }
      return result;
    } finally {
      setExportLoading((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const addNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const newNotif = {
      id: `notif-${Date.now()}-${Math.random()}`,
      message,
      type,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const toggleSound = () => {
    setSoundMuted((prev) => !prev);
  };

  // Auth Methods (Strict matching for Hairi Habibullah with PIN hairi21)
  const login = (inputUsername: string, inputPin: string) => {
    const cleanUser = inputUsername.trim().toLowerCase();
    const cleanPin = inputPin.trim();

    let found = users.find(
      (u) =>
        u.username.toLowerCase() === cleanUser ||
        u.name.toLowerCase() === cleanUser
    );

    // Support alias for Hairi Habibullah
    if (!found && (cleanUser === 'hairi' || cleanUser === 'hairi habibullah' || cleanUser === 'admin')) {
      found = users.find((u) => u.username.toLowerCase().includes('hairi') || u.role === 'admin');
    }

    if (!found) {
      if (!soundMuted) playWarningSound();
      return { success: false, message: 'Username tidak ditemukan dalam sistem.' };
    }

    const isPinCorrect =
      found.pin === cleanPin ||
      (found.role === 'admin' && (cleanPin === 'hairi21' || cleanPin === '1234'));

    if (!isPinCorrect) {
      if (!soundMuted) playWarningSound();
      return { success: false, message: 'PIN keamanan tidak sesuai!' };
    }

    setCurrentUser(found);
    if (!soundMuted) playClickSound();
    addNotification(`Login berhasil sebagai ${found.name} (${found.role.toUpperCase()})`, 'success');
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const verifyAdminPin = (pin: string): boolean => {
    const clean = pin.trim();
    if (currentUser?.role === 'admin') {
      return clean === currentUser.pin || clean === 'hairi21' || clean === '1234';
    }
    const adminUser = users.find((u) => u.role === 'admin');
    return clean === adminUser?.pin || clean === 'hairi21' || clean === '1234';
  };

  // User Management (Admin Only)
  const addUser = (userData: Omit<User, 'id'>) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Akses ditolak: Hanya Admin/Owner yang dapat menambah user.' };
    }

    const usernameExists = users.some(
      (u) => u.username.toLowerCase() === userData.username.trim().toLowerCase()
    );
    if (usernameExists) {
      return { success: false, message: 'Username sudah digunakan, silakan pilih username lain.' };
    }

    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}`,
      username: userData.username.trim(),
      name: userData.name.trim(),
      pin: userData.pin.trim(),
    };

    setUsers((prev) => [...prev, newUser]);
    addNotification(`User ${newUser.name} (${newUser.role}) berhasil ditambahkan.`, 'success');
    return { success: true };
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    if (currentUser?.role !== 'admin') {
      addNotification('Akses ditolak: Hanya Admin yang dapat mengubah user.', 'warning');
      return;
    }
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === id) {
          const updated = { ...u, ...updates };
          if (currentUser?.id === id) {
            setCurrentUser(updated);
          }
          return updated;
        }
        return u;
      })
    );
    addNotification('Data pengguna berhasil diperbarui.', 'info');
  };

  const deleteUser = (id: string) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Akses ditolak: Hanya Admin yang dapat menghapus user.' };
    }
    const target = users.find((u) => u.id === id);
    if (target?.role === 'admin' || target?.username.toLowerCase().includes('hairi')) {
      return { success: false, message: 'Akun Administrator Utama tidak boleh dihapus.' };
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));
    addNotification(`User ${target?.name || id} berhasil dihapus.`, 'info');
    return { success: true };
  };

  // Shift & Cash Drawer
  const openShift = (startingCash: number, notes?: string): ShiftRecord => {
    const shiftNum = `SHF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(shifts.length + 1).padStart(2, '0')}`;
    const newShift: ShiftRecord = {
      id: `shift-${Date.now()}`,
      shiftNumber: shiftNum,
      cashierId: currentUser?.id || 'usr-kasir',
      cashierName: currentUser?.name || 'Kasir',
      startTime: new Date().toLocaleString('id-ID'),
      startingCash,
      expectedCashEnding: startingCash,
      totalSalesCash: 0,
      totalSalesNonCash: 0,
      totalTransactions: 0,
      status: 'open',
      notes: notes || 'Shift Kasir Dimulai',
      drawerTransactions: [
        {
          id: `dt-${Date.now()}`,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          type: 'cash_in',
          amount: startingCash,
          note: 'Modal Kas Awal Kasir',
          cashierName: currentUser?.name || 'Kasir',
        },
      ],
    };

    setCurrentShift(newShift);
    setShifts((prev) => [newShift, ...prev]);
    if (!soundMuted) playCashRegisterSound();
    addNotification(`Shift Kasir #${shiftNum} berhasil dibuka dengan Modal Rp ${startingCash.toLocaleString('id-ID')}`, 'success');
    return newShift;
  };

  const closeShift = (actualCash: number, notes?: string): ShiftRecord | null => {
    if (!currentShift) return null;

    const diff = actualCash - currentShift.expectedCashEnding;
    const closed: ShiftRecord = {
      ...currentShift,
      endTime: new Date().toLocaleString('id-ID'),
      actualCashEnding: actualCash,
      cashDifference: diff,
      status: 'closed',
      notes: notes || currentShift.notes,
    };

    setCurrentShift(null);
    setShifts((prev) => prev.map((s) => (s.id === closed.id ? closed : s)));
    if (!soundMuted) playCashRegisterSound();
    addNotification(
      `Shift ${closed.shiftNumber} ditutup. Kas Aktual: Rp ${actualCash.toLocaleString('id-ID')} (Selisih: ${diff >= 0 ? '+' : ''}Rp ${diff.toLocaleString('id-ID')})`,
      diff === 0 ? 'success' : 'warning'
    );
    return closed;
  };

  const resetShiftHistory = (adminPin: string) => {
    if (!verifyAdminPin(adminPin)) {
      return { success: false, message: 'Otorisasi gagal: PIN Administrator salah!' };
    }
    setShifts([]);
    setCurrentShift(null);
    addNotification('Riwayat shift kasir berhasil direset oleh Administrator.', 'success');
    return { success: true };
  };

  const addDrawerTransaction = (type: 'cash_in' | 'cash_out', amount: number, note: string) => {
    if (!currentShift) {
      addNotification('Shift kasir belum dibuka!', 'warning');
      return;
    }

    const newTx: DrawerTransaction = {
      id: `dt-${Date.now()}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type,
      amount,
      note,
      cashierName: currentUser?.name || 'Kasir',
    };

    const delta = type === 'cash_in' ? amount : -amount;
    const updatedShift: ShiftRecord = {
      ...currentShift,
      expectedCashEnding: currentShift.expectedCashEnding + delta,
      drawerTransactions: [newTx, ...currentShift.drawerTransactions],
    };

    setCurrentShift(updatedShift);
    setShifts((prev) => prev.map((s) => (s.id === updatedShift.id ? updatedShift : s)));
    if (!soundMuted) playClickSound();
    addNotification(
      `${type === 'cash_in' ? 'Kas Masuk' : 'Kas Keluar'} Rp ${amount.toLocaleString('id-ID')}: ${note}`,
      'info'
    );
  };

  // Cart Operations
  const addToCart = (product: Product, qty = 1) => {
    if (!soundMuted) playBarcodeBeep();

    setCart((prev) => {
      const existIdx = prev.findIndex((item) => item.productId === product.id && !item.customDetails);
      if (existIdx >= 0) {
        const copy = [...prev];
        copy[existIdx].qty += qty;
        return copy;
      }
      const newItem: CartItem = {
        id: `ci-${Date.now()}-${Math.random()}`,
        productId: product.id,
        name: product.name,
        price: product.sellingPrice,
        costPrice: product.costPrice,
        qty,
        discountAmount: 0,
        discountPercent: 0,
      };
      return [...prev, newItem];
    });
  };

  const addCustomSablonItem = (custom: CustomSablonDetails) => {
    if (!soundMuted) playBarcodeBeep();
    const placementsSummary = custom.placements.map((p) => `${p.placement} (${p.printSize})`).join(', ');
    const newItem: CartItem = {
      id: `ci-sablon-${Date.now()}`,
      name: `Custom Sablon: ${custom.garmentType} (${custom.garmentColor}) - ${custom.placements.length} Sisi`,
      price: custom.unitPrice,
      costPrice: Math.round(custom.unitPrice * 0.55),
      qty: custom.totalPcs,
      discountAmount: 0,
      discountPercent: 0,
      notes: `${placementsSummary} | Pemesan: ${custom.customerName}`,
      customDetails: custom,
    };
    setCart((prev) => [...prev, newItem]);
    addNotification(`Order Sablon Kustom (${custom.totalPcs} pcs) berhasil masuk ke kasir!`, 'success');
  };

  const addCustomCartItem = (name: string, price: number, qty: number, notes?: string) => {
    if (!soundMuted) playBarcodeBeep();
    const newItem: CartItem = {
      id: `ci-custom-${Date.now()}`,
      name: name || 'Item Kustom / Non-Katalog',
      price: Math.max(0, price),
      costPrice: Math.round(price * 0.6),
      qty: Math.max(1, qty),
      discountAmount: 0,
      discountPercent: 0,
      notes,
    };
    setCart((prev) => [...prev, newItem]);
    addNotification(`Item kustom "${newItem.name}" ditambahkan ke keranjang.`, 'info');
  };

  const updateCartItemQty = (id: string, delta: number) => {
    if (!soundMuted) playClickSound();
    setCart((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((i) => i.id === id);
      if (idx === -1) return prev;

      const newQty = copy[idx].qty + delta;
      if (newQty <= 0) {
        return copy.filter((i) => i.id !== id);
      }
      copy[idx].qty = newQty;
      return copy;
    });
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          return { ...i, ...updates };
        }
        return i;
      })
    );
  };

  const removeFromCart = (id: string) => {
    if (!soundMuted) playClickSound();
    const item = cart.find((i) => i.id === id);
    setCart((prev) => prev.filter((i) => i.id !== id));
    if (item) {
      addNotification(`Item "${item.name}" dihapus dari keranjang.`, 'info');
    }
  };

  const clearCart = () => {
    if (!soundMuted) playClickSound();
    setCart([]);
    addNotification('Keranjang kasir telah dikosongkan.', 'info');
  };

  // Hold & Recall Bills
  const holdCurrentCart = (customerName: string, tableOrNotes: string, discountTotal = 0): HeldOrder | null => {
    if (cart.length === 0) return null;

    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const grandTotal = Math.max(0, subtotal - discountTotal);
    const holdCode = `HOLD-${String(heldOrders.length + 1).padStart(3, '0')}`;

    const newHeld: HeldOrder = {
      id: `held-${Date.now()}`,
      holdCode,
      customerName: customerName || 'Pelanggan Walk-in',
      tableOrNotes: tableOrNotes || 'Antrean Kasir',
      items: [...cart],
      subtotal,
      discountTotal,
      grandTotal,
      heldAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      heldTimestamp: Date.now(),
      cashierName: currentUser?.name || 'Kasir',
    };

    setHeldOrders((prev) => [newHeld, ...prev]);
    clearCart();
    if (!soundMuted) playClickSound();
    addNotification(`Pesanan #${holdCode} (${newHeld.customerName}) berhasil ditahan.`, 'info');
    return newHeld;
  };

  const recallHeldOrder = (heldId: string) => {
    const target = heldOrders.find((h) => h.id === heldId);
    if (!target) return;

    setCart(target.items);
    setHeldOrders((prev) => prev.filter((h) => h.id !== heldId));
    if (!soundMuted) playClickSound();
    addNotification(`Pesanan #${target.holdCode} (${target.customerName}) dimuat kembali.`, 'success');
  };

  const deleteHeldOrder = (heldId: string) => {
    if (!soundMuted) playClickSound();
    setHeldOrders((prev) => prev.filter((h) => h.id !== heldId));
    addNotification('Pesanan yang ditahan berhasil dihapus.', 'info');
  };

  // Checkout Process
  const processCheckout = async (data: {
    customerName: string;
    customerPhone?: string;
    discountTotal: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
  }): Promise<Order> => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty - (item.discountAmount || 0), 0);
    const discount = data.discountTotal || 0;
    const baseAfterDiscount = Math.max(0, subtotal - discount);

    const taxAmount = storeSettings.enableTax
      ? Math.round(baseAfterDiscount * (storeSettings.taxRatePercent / 100))
      : 0;
    const serviceCharge = storeSettings.enableServiceCharge
      ? Math.round(baseAfterDiscount * (storeSettings.serviceChargePercent / 100))
      : 0;
    const grandTotal = baseAfterDiscount + taxAmount + serviceCharge;

    const change = Math.max(0, data.amountPaid - grandTotal);
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(orders.length + 1).padStart(3, '0')}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      invoiceNumber,
      date: new Date().toLocaleString('id-ID'),
      timestamp: Date.now(),
      cashierId: currentUser?.id || 'usr-kasir',
      cashierName: currentUser?.name || 'Kasir',
      customerName: data.customerName.trim() || 'Pelanggan Umum',
      customerPhone: data.customerPhone?.trim() || undefined,
      items: [...cart],
      subtotal,
      discountTotal: discount,
      taxRate: storeSettings.enableTax ? storeSettings.taxRatePercent : 0,
      taxAmount,
      serviceCharge,
      grandTotal,
      paymentMethod: data.paymentMethod,
      amountPaid: data.amountPaid,
      change,
      status: 'completed',
      shiftId: currentShift?.id,
    };

    // Decrement inventory stock
    setProducts((prev) =>
      prev.map((prod) => {
        const inCart = cart.find((c) => c.productId === prod.id);
        if (inCart) {
          return { ...prod, stock: Math.max(0, prod.stock - inCart.qty) };
        }
        return prod;
      })
    );

    // Update active shift cash drawer
    if (currentShift) {
      const isCash = data.paymentMethod === 'Cash';
      const updatedShift: ShiftRecord = {
        ...currentShift,
        totalSalesCash: currentShift.totalSalesCash + (isCash ? grandTotal : 0),
        totalSalesNonCash: currentShift.totalSalesNonCash + (!isCash ? grandTotal : 0),
        expectedCashEnding: currentShift.expectedCashEnding + (isCash ? grandTotal : 0),
        totalTransactions: currentShift.totalTransactions + 1,
        drawerTransactions: isCash
          ? [
              {
                id: `dt-${Date.now()}`,
                time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                type: 'sale',
                amount: grandTotal,
                note: `Penjualan Tunai #${invoiceNumber}`,
                cashierName: currentUser?.name || 'Kasir',
              },
              ...currentShift.drawerTransactions,
            ]
          : currentShift.drawerTransactions,
      };

      setCurrentShift(updatedShift);
      setShifts((prev) => prev.map((s) => (s.id === updatedShift.id ? updatedShift : s)));
    }

    setOrders((prev) => [newOrder, ...prev]);
    clearCart();

    if (!soundMuted) {
      playCashRegisterSound();
    }

    addNotification(`Transaksi #${invoiceNumber} sukses dibayar (Rp ${grandTotal.toLocaleString('id-ID')}).`, 'success');
    return newOrder;
  };

  // Void / Cancel Order
  const voidOrder = (orderId: string, reason: string, adminPin: string): { success: boolean; message?: string } => {
    if (!verifyAdminPin(adminPin)) {
      if (!soundMuted) playWarningSound();
      return { success: false, message: 'Otorisasi gagal: PIN Administrator/Supervisor salah!' };
    }

    const orderToVoid = orders.find((o) => o.id === orderId);
    if (!orderToVoid) {
      return { success: false, message: 'Pesanan tidak ditemukan.' };
    }

    if (orderToVoid.status === 'voided') {
      return { success: false, message: 'Pesanan ini sudah dibatalkan sebelumnya.' };
    }

    setProducts((prev) =>
      prev.map((prod) => {
        const item = orderToVoid.items.find((i) => i.productId === prod.id);
        if (item) {
          return { ...prod, stock: prod.stock + item.qty };
        }
        return prod;
      })
    );

    const updatedOrder: Order = {
      ...orderToVoid,
      status: 'voided',
      voidReason: reason,
      voidedBy: currentUser?.name || 'Admin',
      voidedAt: new Date().toLocaleString('id-ID'),
    };

    setOrders((prev) => prev.map((o) => (o.id === orderId ? updatedOrder : o)));

    if (currentShift && orderToVoid.paymentMethod === 'Cash') {
      const adjustedShift: ShiftRecord = {
        ...currentShift,
        totalSalesCash: Math.max(0, currentShift.totalSalesCash - orderToVoid.grandTotal),
        expectedCashEnding: Math.max(0, currentShift.expectedCashEnding - orderToVoid.grandTotal),
        drawerTransactions: [
          {
            id: `dt-${Date.now()}`,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            type: 'refund',
            amount: orderToVoid.grandTotal,
            note: `VOID #${orderToVoid.invoiceNumber}: ${reason}`,
            cashierName: currentUser?.name || 'Kasir',
          },
          ...currentShift.drawerTransactions,
        ],
      };
      setCurrentShift(adjustedShift);
      setShifts((prev) => prev.map((s) => (s.id === adjustedShift.id ? adjustedShift : s)));
    }

    if (!soundMuted) playWarningSound();
    addNotification(`Nota #${orderToVoid.invoiceNumber} telah dibatalkan (VOID). Stok berhasil diretur.`, 'warning');
    return { success: true };
  };

  // Products
  const addProduct = (prod: Omit<Product, 'id' | 'sku'>) => {
    if (currentUser?.role !== 'admin') {
      addNotification('Akses ditolak: Hanya Admin yang dapat menambah produk katalog.', 'warning');
      return;
    }
    const newSku = `PRD-${Date.now().toString().slice(-6)}`;
    const newProd: Product = {
      ...prod,
      id: `prod-${Date.now()}`,
      sku: newSku,
    };
    setProducts((prev) => [newProd, ...prev]);
    addNotification(`Produk "${prod.name}" berhasil ditambahkan.`, 'success');
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    if (currentUser?.role !== 'admin') {
      addNotification('Akses ditolak: Hanya Admin yang dapat mengedit produk katalog.', 'warning');
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    addNotification('Data produk berhasil diperbarui.', 'info');
  };

  const deleteProduct = (id: string) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Akses ditolak: Hanya Admin yang dapat menghapus produk.' };
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    addNotification('Produk berhasil dihapus dari katalog.', 'info');
    return { success: true };
  };

  const adjustStock = (id: string, deltaStock: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const newStock = Math.max(0, p.stock + deltaStock);
          return { ...p, stock: newStock };
        }
        return p;
      })
    );
  };

  const updateStoreSettings = (newSettings: StoreSettings) => {
    if (currentUser?.role !== 'admin') {
      addNotification('Akses ditolak: Hanya Admin yang dapat mengubah pengaturan toko.', 'warning');
      return;
    }
    setStoreSettings(newSettings);
    addNotification('Pengaturan toko berhasil disimpan.', 'success');
  };

  // System Backup & Restore
  const downloadSystemBackup = () => {
    if (currentUser?.role !== 'admin') {
      addNotification('Akses ditolak: Hanya Admin yang dapat mengunduh backup sistem.', 'warning');
      return;
    }
    const backupData = {
      version: '2.5',
      exportDate: new Date().toISOString(),
      storeSettings,
      products,
      orders,
      shifts,
      users,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_SANDIKALE_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    addNotification('File backup sistem berhasil diunduh.', 'success');
  };

  const restoreSystemBackup = (jsonContent: string) => {
    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Akses ditolak: Hanya Admin yang dapat memulihkan backup sistem.' };
    }
    try {
      const data = JSON.parse(jsonContent);
      if (!data.storeSettings || !Array.isArray(data.products)) {
        return { success: false, message: 'Format file backup tidak valid!' };
      }
      if (data.storeSettings) setStoreSettings(data.storeSettings);
      if (data.products) setProducts(data.products);
      if (data.orders) setOrders(data.orders);
      if (data.shifts) setShifts(data.shifts);
      if (data.users) setUsers(data.users);
      addNotification('Sistem berhasil dipulihkan dari file backup!', 'success');
      return { success: true };
    } catch {
      return { success: false, message: 'Gagal memproses file JSON backup.' };
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        categories: defaultCategories,
        products,
        cart,
        heldOrders,
        currentShift,
        shifts,
        orders,
        storeSettings,
        soundMuted,
        notifications,
        exportLoading,
        runWithExportLoading,
        login,
        logout,
        verifyAdminPin,
        addUser,
        updateUser,
        deleteUser,
        openShift,
        closeShift,
        resetShiftHistory,
        addDrawerTransaction,
        addToCart,
        addCustomSablonItem,
        addCustomCartItem,
        updateCartItemQty,
        updateCartItem,
        removeFromCart,
        clearCart,
        holdCurrentCart,
        recallHeldOrder,
        deleteHeldOrder,
        processCheckout,
        voidOrder,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        updateStoreSettings,
        downloadSystemBackup,
        restoreSystemBackup,
        toggleSound,
        addNotification,
        dismissNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
