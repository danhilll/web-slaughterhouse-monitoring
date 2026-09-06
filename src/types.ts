export type AnimalType = 'Cow' | 'Pig' | 'Both';
export type PaymentStatus = 'Paid' | 'Unpaid' | 'Overdue';
export type NotificationType = 'info' | 'warning' | 'alert';
export type VendorStatus = 'Active' | 'Inactive';
export type SlaughterStatus = 'Pending' | 'Completed' | 'Cancelled';

export type Vendor = {
  id: string;
  name: string;
  address: string;
  contact_number: string;
  email: string;
  animal_type: AnimalType;
  created_at: string;
  status: VendorStatus;
};

export type SlaughterRecord = {
  id: string;
  vendor_id: string;
  date: string;
  animal_type: AnimalType;
  number_of_heads: number;
  number_of_heads_cow?: number | null;
  number_of_heads_pig?: number | null;
  meat_type_to_deliver: string;
  livestock_type: string;
  kilograms_cow: number | null;
  kilograms_pig: number | null;
  status: SlaughterStatus;
  created_at: string;
  vendor_name?: string;
};

export type Invoice = {
  id: string;
  vendor_id: string;
  slaughter_record_id: string | null;
  date_issued: string;
  due_date: string;
  number_of_heads_cow: number;
  number_of_heads_pig: number;
  corral_fee: number;
  delivery_fee: number;
  anti_mortem_fee: number;
  facility_fee: number;
  total_amount: number;
  payment_status: PaymentStatus;
  notes?: string;
  vendor_name?: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type FeeConfig = {
  id: string;
  label: string;
  amount: number;
};

export type DashboardData = {
  summary: {
    totalVendors: number;
    totalRecordsToday: number;
    totalRecordsThisMonth: number;
    totalRevenueThisMonth: number;
    unpaidInvoicesCount: number;
  };
  recentSlaughterRecords: SlaughterRecord[];
  recentInvoices: Invoice[];
  monthlySlaughterVolume: { month: string; Cow: number; Pig: number }[];
  feeBreakdown: { name: string; value: number }[];
  municipality: string;
};
