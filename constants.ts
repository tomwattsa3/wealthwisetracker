


import { Category, Bank } from './types';

export const INITIAL_BANKS: Bank[] = [
  { id: 'wio', name: 'Wio Bank', currency: 'AED', icon: 'WB' },
  { id: 'revolut', name: 'Revolut', currency: 'GBP', icon: 'RV' },
];

export const INITIAL_CATEGORIES: Category[] = [
  // Expenses
  {
    id: 'apt',
    name: 'Apartment',
    subcategories: ['Rent', 'AC Bill', 'Wi-Fi', 'Gas Bill', 'Utilities'],
    type: 'EXPENSE',
    color: '#ef4444', // Red-500
  },
  {
    id: 'food',
    name: 'Food',
    subcategories: ['Meals Out', 'Food Delivery', 'Snacks'],
    type: 'EXPENSE',
    color: '#f97316', // Orange-500
  },
  {
    id: 'groceries',
    name: 'Groceries',
    subcategories: ['In-Store Shopping', 'Ordering In/Delivery', 'Household Supplies'],
    type: 'EXPENSE',
    color: '#eab308', // Yellow-500
  },
  {
    id: 'personal',
    name: 'Personal',
    subcategories: ['Health', 'Clothes', 'Amazon', 'Phone Plan', 'Gym'],
    type: 'EXPENSE',
    color: '#8b5cf6', // Violet-500
  },
  {
    id: 'car',
    name: 'Car',
    subcategories: ['Fuel', 'Insurance', 'Parts', 'Maintenance', 'Parking'],
    type: 'EXPENSE',
    color: '#06b6d4', // Cyan-500
  },
  {
    id: 'travel',
    name: 'Travel',
    subcategories: ['Uber/Rideshare', 'Flights', 'Hotels', 'Public Transit'],
    type: 'EXPENSE',
    color: '#ec4899', // Pink-500
  },
  // Income
  {
    id: 'income_salary',
    name: 'Salary',
    subcategories: ['Main Job', 'Bonus'],
    type: 'INCOME',
    color: '#10b981', // Emerald-500
  },
  {
    id: 'income_other',
    name: 'Other Income',
    subcategories: ['Freelance', 'Gifts', 'Investments'],
    type: 'INCOME',
    color: '#34d399', // Emerald-400
  },
  // Excluded / Neutral
  {
    id: 'excluded',
    name: 'Excluded',
    subcategories: ['Transfer', 'Credit Card Payment', 'Reimbursement', 'Refund', 'Duplicate'],
    type: 'EXPENSE',
    color: '#64748b', // Slate-500
  }
];

export const MOCK_TRANSACTIONS = [
  { 
    id: '1', 
    date: new Date().toISOString().split('T')[0], 
    amount: 525, 
    originalAmount: 2500, 
    originalCurrency: 'AED', 
    type: 'EXPENSE', 
    categoryId: 'apt', 
    categoryName: 'Apartment', 
    subcategoryName: 'Rent', 
    description: 'Monthly Rent', 
    bankName: 'Wio Bank' 
  },
  { id: '2', date: new Date().toISOString().split('T')[0], amount: 150, type: 'EXPENSE', categoryId: 'apt', categoryName: 'Apartment', subcategoryName: 'AC Bill', description: 'Summer cooling', bankName: 'Revolut' },
  { id: '3', date: new Date().toISOString().split('T')[0], amount: 85, type: 'EXPENSE', categoryId: 'personal', categoryName: 'Personal', subcategoryName: 'Phone Plan', description: 'Data plan', bankName: 'Revolut' },
  { 
    id: '4', 
    date: new Date().toISOString().split('T')[0], 
    amount: 808.50, 
    originalAmount: 3850, 
    originalCurrency: 'AED', 
    type: 'INCOME', 
    categoryId: 'income_salary', 
    categoryName: 'Salary', 
    subcategoryName: 'Main Job', 
    description: 'Paycheck', 
    bankName: 'Wio Bank' 
  },
];
