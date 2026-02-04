import { GoogleGenAI } from "@google/genai";
import { Transaction } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getFinancialAdvice = async (transactions: Transaction[]): Promise<string> => {
  try {
    // Filter for the last 30 days to keep the context relevant and small
    const recentTransactions = transactions.slice(0, 50).map(t => ({
      date: t.date,
      type: t.type,
      category: t.categoryName,
      subcategory: t.subcategoryName,
      amount: t.amount,
      desc: t.description
    }));

    const prompt = `
      You are a wise personal finance advisor. Analyze the following list of recent financial transactions.
      
      Transactions:
      ${JSON.stringify(recentTransactions)}

      Please provide a brief, helpful analysis in markdown format. 
      1. Summarize the spending habits.
      2. Point out the largest expense categories.
      3. Give one specific, actionable tip to save money based on this data.
      
      Keep the tone encouraging but professional. Limit response to 150 words.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Unable to generate insights at this time.";
  } catch (error) {
    console.error("Error fetching Gemini insights:", error);
    return "Sorry, I couldn't analyze your data right now. Please ensure your API key is valid.";
  }
};
