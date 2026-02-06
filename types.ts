

export type TransactionType = 'INCOME' | 'EXPENSE';

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
  type: TransactionType;
  color: string;
}

export interface Bank {
  id: string;
  name: string;
  currency: string;
  icon: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  amountGBP: number;
  amountAED: number;
  originalAmount?: number;
  originalCurrency?: string;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  subcategoryName: string;
  description: string;
  notes?: string;
  excluded?: boolean;
  bankName?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

export interface DebtItem {
  id: string;
  name: string; // e.g., "Amex Platinum"
  amount: number; // Amount owed
  interestRate?: number;
  dueDate?: string;
  type: 'credit' | 'loan' | 'mortgage' | 'other';
}

export interface AssetItem {
  id: string;
  name: string; // e.g., "Chase Savings"
  amount: number; // Current value
  type: 'cash' | 'investment' | 'property' | 'crypto' | 'other';
}
