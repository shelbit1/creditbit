"use client";

import { useMemo, useState, useEffect } from "react";

type EntryType = "credit" | "debit";
type EntryStatus = "active" | "archived";
type FilterMode = "all" | "i_owe" | "owed_to_me";

type PaymentFixation = {
  amount: number;
  account: string;
  description?: string;
  receiptFileName?: string;
  isMarketplacePayment?: boolean;
  fixedAt: string;
};

type ReceiptFixation = {
  amount: number;
  account: string;
  description?: string;
  receiptFileName?: string;
  fixedAt: string;
};

type LedgerEntry = {
  id: string;
  type: EntryType;
  amount: number;
  description: string;
  counterparty: string;
  account: string;
  date: string;
  createdAt: string;
  status: EntryStatus;
  paymentFixations?: PaymentFixation[];
  receiptFixations?: ReceiptFixation[];
};

const STORAGE_KEY = "ledger-entries";

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EntryStatus>("active");
  const [showBorrowForm, setShowBorrowForm] = useState<boolean>(false);
  const [showLendForm, setShowLendForm] = useState<boolean>(false);
  const [showPaymentFixForm, setShowPaymentFixForm] = useState<string | null>(null);
  const [showReceiptFixForm, setShowReceiptFixForm] = useState<string | null>(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState<string | null>(null);
  
  // Поля формы "беру в долг"
  const [borrowCounterparty, setBorrowCounterparty] = useState<string>("");
  const [borrowDate, setBorrowDate] = useState<string>("");
  const [borrowDescription, setBorrowDescription] = useState<string>("");
  const [borrowAmount, setBorrowAmount] = useState<string>("");
  const [creditAccount, setCreditAccount] = useState<string>("");

  // Поля формы "отдаю в долг"
  const [lendCounterparty, setLendCounterparty] = useState<string>("");
  const [lendDate, setLendDate] = useState<string>("");
  const [lendDescription, setLendDescription] = useState<string>("");
  const [lendAmount, setLendAmount] = useState<string>("");
  const [debitAccount, setDebitAccount] = useState<string>("");

  // Поля формы "зафиксировать платеж"
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentAccount, setPaymentAccount] = useState<string>("");
  const [paymentDescription, setPaymentDescription] = useState<string>("");
  const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null);
  const [isMarketplacePayment, setIsMarketplacePayment] = useState<boolean>(false);

  // Поля формы "зафиксировать поступление"
  const [receiptAmount, setReceiptAmount] = useState<string>("");
  const [receiptAccount, setReceiptAccount] = useState<string>("");
  const [receiptDescription, setReceiptDescription] = useState<string>("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Загрузка данных из localStorage при монтировании компонента
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as any[];
        const normalized: LedgerEntry[] = parsed.map((e) => ({
          ...e,
          status: e.status === "archived" ? "archived" : "active",
        }));
        setEntries(normalized);
      }
    } catch (error) {
      console.error("Ошибка загрузки данных из localStorage:", error);
    }
  }, []);

  // Сохранение данных в localStorage при изменении entries
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error("Ошибка сохранения данных в localStorage:", error);
    }
  }, [entries]);

  const balance = useMemo(() => {
    return entries.reduce((acc, e) => {
      let entryBalance = e.type === "credit" ? e.amount : -e.amount;
      
      // Если это долг (debit) и есть зафиксированные платежи, уменьшаем долг на сумму всех платежей
      if (e.type === "debit" && e.paymentFixations) {
        const totalPayments = e.paymentFixations.reduce((sum, payment) => sum + payment.amount, 0);
        entryBalance += totalPayments; // уменьшаем долг (добавляем положительную сумму к отрицательному долгу)
      }
      
      // Если это кредит (credit) и есть зафиксированные поступления, уменьшаем кредит на сумму всех поступлений
      if (e.type === "credit" && e.receiptFixations) {
        const totalReceipts = e.receiptFixations.reduce((sum, receipt) => sum + receipt.amount, 0);
        entryBalance -= totalReceipts; // уменьшаем кредит (вычитаем из положительной суммы)
      }
      
      return acc + entryBalance;
    }, 0);
  }, [entries]);

  // Сколько мне должны (по кредитам минус зафиксированные поступления)
  const totalOwedToMe = useMemo(() => {
    return entries.reduce((sum, e) => {
      if (e.type !== "credit") return sum;
      const received = (e.receiptFixations || []).reduce((s, r) => s + r.amount, 0);
      const outstanding = Math.max(e.amount - received, 0);
      return sum + outstanding;
    }, 0);
  }, [entries]);

  // Сколько я должен (по дебетам минус зафиксированные платежи)
  const totalIOwe = useMemo(() => {
    return entries.reduce((sum, e) => {
      if (e.type !== "debit") return sum;
      const paid = (e.paymentFixations || []).reduce((s, p) => s + p.amount, 0);
      const outstanding = Math.max(e.amount - paid, 0);
      return sum + outstanding;
    }, 0);
  }, [entries]);

  // Остаток по записи и производный статус
  function computeOutstanding(entry: LedgerEntry): number {
    if (entry.type === "debit") {
      const paid = (entry.paymentFixations || []).reduce((s, p) => s + p.amount, 0);
      return Math.max(entry.amount - paid, 0);
    }
    const received = (entry.receiptFixations || []).reduce((s, r) => s + r.amount, 0);
    return Math.max(entry.amount - received, 0);
  }

  function computeStatus(entry: LedgerEntry): EntryStatus {
    return computeOutstanding(entry) > 0 ? "active" : "archived";
  }

  // Отфильтрованные записи для отображения
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filter === "i_owe") {
      result = result.filter((e) => e.type === "debit" && computeOutstanding(e) > 0);
    } else if (filter === "owed_to_me") {
      result = result.filter((e) => e.type === "credit" && computeOutstanding(e) > 0);
    }

    if (statusFilter !== "all") {
      result = result.filter((e) => computeStatus(e) === statusFilter);
    }

    return result;
  }, [entries, filter, statusFilter]);

  function handleBorrow() {
    setShowBorrowForm(true);
    setShowLendForm(false);
  }

  function handleLend() {
    setShowLendForm(true);
    setShowBorrowForm(false);
  }

  function handleSubmitBorrow(e: React.FormEvent) {
    e.preventDefault();
    
    const parsed = Number(borrowAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Введите положительную сумму");
      return;
    }
    if (borrowCounterparty.trim().length === 0) {
      alert("Введите контрагента");
      return;
    }
    if (borrowDescription.trim().length === 0) {
      alert("Введите описание");
      return;
    }
    if (borrowDate.length === 0) {
      alert("Выберите дату");
      return;
    }

    const newEntry: LedgerEntry = {
      id: crypto.randomUUID(),
      type: "debit", // беру в долг = дебит (увеличиваю пассив)
      amount: Math.round(parsed * 100) / 100,
      description: borrowDescription.trim(),
      counterparty: borrowCounterparty.trim(),
      account: creditAccount.trim(),
      date: borrowDate,
      createdAt: new Date().toISOString(),
      status: "active",
    };

    setEntries((prev) => [newEntry, ...prev]);
    resetBorrowForm();
  }

  function handleSubmitLend(e: React.FormEvent) {
    e.preventDefault();
    
    const parsed = Number(lendAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Введите положительную сумму");
      return;
    }
    if (lendCounterparty.trim().length === 0) {
      alert("Введите контрагента");
      return;
    }
    if (lendDescription.trim().length === 0) {
      alert("Введите описание");
      return;
    }
    if (lendDate.length === 0) {
      alert("Выберите дату");
      return;
    }

    const newEntry: LedgerEntry = {
      id: crypto.randomUUID(),
      type: "credit", // отдаю в долг = кредит (увеличиваю актив)
      amount: Math.round(parsed * 100) / 100,
      description: lendDescription.trim(),
      counterparty: lendCounterparty.trim(),
      account: debitAccount.trim(),
      date: lendDate,
      createdAt: new Date().toISOString(),
      status: "active",
    };

    setEntries((prev) => [newEntry, ...prev]);
    resetLendForm();
  }

  function resetBorrowForm() {
    setBorrowCounterparty("");
    setBorrowDate("");
    setBorrowDescription("");
    setBorrowAmount("");
    setCreditAccount("");
    setShowBorrowForm(false);
  }

  function resetLendForm() {
    setLendCounterparty("");
    setLendDate("");
    setLendDescription("");
    setLendAmount("");
    setDebitAccount("");
    setShowLendForm(false);
  }

  function handleFixPayment(entryId: string) {
    setShowPaymentFixForm(entryId);
  }

  function handleFixReceipt(entryId: string) {
    setShowReceiptFixForm(entryId);
  }

  function handleSubmitPaymentFix(e: React.FormEvent) {
    e.preventDefault();
    
    // Валидация обязательных полей
    const parsed = Number(paymentAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Введите положительную сумму");
      return;
    }
    if (!isMarketplacePayment && paymentAccount.trim().length === 0) {
      alert("Введите счет списания");
      return;
    }

    // Добавляем новый платеж к записи
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === showPaymentFixForm
          ? {
              ...entry,
              paymentFixations: [
                ...(entry.paymentFixations || []),
                {
                  amount: Math.round(parsed * 100) / 100,
                  account: isMarketplacePayment ? "Маркетплейс" : paymentAccount.trim(),
                  description: paymentDescription.trim() || undefined,
                  receiptFileName: paymentReceipt?.name || undefined,
                  isMarketplacePayment: isMarketplacePayment,
                  fixedAt: new Date().toISOString(),
                }
              ]
            }
          : entry
      )
    );

    resetPaymentFixForm();
  }

  function handleSubmitReceiptFix(e: React.FormEvent) {
    e.preventDefault();
    
    // Валидация обязательных полей
    const parsed = Number(receiptAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Введите положительную сумму");
      return;
    }
    if (receiptAccount.trim().length === 0) {
      alert("Введите счет зачисления");
      return;
    }

    // Добавляем новое поступление к записи
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === showReceiptFixForm
          ? {
              ...entry,
              receiptFixations: [
                ...(entry.receiptFixations || []),
                {
                  amount: Math.round(parsed * 100) / 100,
                  account: receiptAccount.trim(),
                  description: receiptDescription.trim() || undefined,
                  receiptFileName: receiptFile?.name || undefined,
                  fixedAt: new Date().toISOString(),
                }
              ]
            }
          : entry
      )
    );

    resetReceiptFixForm();
  }

  function resetPaymentFixForm() {
    setPaymentAmount("");
    setPaymentAccount("");
    setPaymentDescription("");
    setPaymentReceipt(null);
    setIsMarketplacePayment(false);
    setShowPaymentFixForm(null);
  }

  function resetReceiptFixForm() {
    setReceiptAmount("");
    setReceiptAccount("");
    setReceiptDescription("");
    setReceiptFile(null);
    setShowReceiptFixForm(null);
  }

  function togglePaymentHistory(entryId: string) {
    setShowPaymentHistory(showPaymentHistory === entryId ? null : entryId);
  }

  // Ручное переключение статуса больше не требуется — статус вычисляется из остатка

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Кредит | Дебит</h1>

      <div className="space-y-3 mb-6">
        <div className="flex gap-3">
          <button
            onClick={handleBorrow}
            className="flex-1 px-4 py-3 rounded-md bg-red-600 text-white hover:bg-red-700 font-medium"
          >
            + беру в долг
          </button>
          <button
            onClick={handleLend}
            className="flex-1 px-4 py-3 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-medium"
          >
            − отдаю в долг
          </button>
        </div>

        {showBorrowForm && (
          <form onSubmit={handleSubmitBorrow} className="space-y-3 border border-black/[.08] dark:border-white/[.145] rounded-md p-4">
            <h3 className="font-medium text-lg">Беру в долг</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Контрагент:</label>
              <input
                type="text"
                value={borrowCounterparty}
                onChange={(e) => setBorrowCounterparty(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="Имя контрагента"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Дата:</label>
              <input
                type="date"
                value={borrowDate}
                onChange={(e) => setBorrowDate(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Описание:</label>
              <input
                type="text"
                value={borrowDescription}
                onChange={(e) => setBorrowDescription(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="Описание операции"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Сумма:</label>
              <input
                type="number"
                inputMode="decimal"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Счет зачисления:</label>
              <input
                type="text"
                value={creditAccount}
                onChange={(e) => setCreditAccount(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="Номер счета или название"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={resetBorrowForm}
                className="px-4 py-2 rounded-md border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06] font-medium"
              >
                Отмена
              </button>
            </div>
          </form>
        )}

        {showLendForm && (
          <form onSubmit={handleSubmitLend} className="space-y-3 border border-black/[.08] dark:border-white/[.145] rounded-md p-4">
            <h3 className="font-medium text-lg">Отдаю в долг</h3>
            
            <div>
              <label className="block text-sm font-medium mb-1">Контрагент:</label>
              <input
                type="text"
                value={lendCounterparty}
                onChange={(e) => setLendCounterparty(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="Имя контрагента"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Дата:</label>
              <input
                type="date"
                value={lendDate}
                onChange={(e) => setLendDate(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Описание:</label>
              <input
                type="text"
                value={lendDescription}
                onChange={(e) => setLendDescription(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="Описание операции"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Сумма:</label>
              <input
                type="number"
                inputMode="decimal"
                value={lendAmount}
                onChange={(e) => setLendAmount(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Счет списания:</label>
              <input
                type="text"
                value={debitAccount}
                onChange={(e) => setDebitAccount(e.target.value)}
                className="w-full border border-black/[.08] dark:border-white/[.145] rounded-md px-3 py-2 bg-background"
                placeholder="Номер счета или название"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={resetLendForm}
                className="px-4 py-2 rounded-md border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06] font-medium"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mb-4 text-sm flex items-center justify-between">
        <div>
          Баланс: <span className={balance >= 0 ? "text-green-600" : "text-red-600"}>{balance.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-6">
          <div>
            Мне должны: <span className="text-green-600">{totalOwedToMe.toFixed(2)}</span>
          </div>
          <div>
            Я должен: <span className="text-red-600">{totalIOwe.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs">
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-1 rounded ${
            filter === "all"
              ? "bg-foreground text-background border border-transparent"
              : "border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06]"
          }`}
        >
          все
        </button>
        <button
          onClick={() => setFilter("i_owe")}
          className={`px-2 py-1 rounded ${
            filter === "i_owe"
              ? "bg-foreground text-background border border-transparent"
              : "border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06]"
          }`}
        >
          я должен
        </button>
        <button
          onClick={() => setFilter("owed_to_me")}
          className={`px-2 py-1 rounded ${
            filter === "owed_to_me"
              ? "bg-foreground text-background border border-transparent"
              : "border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06]"
          }`}
        >
          мне должны
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-2 py-1 rounded ${
            statusFilter === "all"
              ? "bg-foreground text-background border border-transparent"
              : "border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06]"
          }`}
        >
          все статусы
        </button>
        <button
          onClick={() => setStatusFilter("active")}
          className={`px-2 py-1 rounded ${
            statusFilter === "active"
              ? "bg-foreground text-background border border-transparent"
              : "border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06]"
          }`}
        >
          активные
        </button>
        <button
          onClick={() => setStatusFilter("archived")}
          className={`px-2 py-1 rounded ${
            statusFilter === "archived"
              ? "bg-foreground text-background border border-transparent"
              : "border border-black/[.08] dark:border-white/[.145] hover:bg-black/[.05] dark:hover:bg-white/[.06]"
          }`}
        >
          архивные
        </button>
      </div>

      <ul className="space-y-2">
        {filteredEntries.length === 0 && (
          <li className="text-sm text-black/60 dark:text-white/60">Пока нет операций</li>
        )}
        {filteredEntries.map((e) => (
          <li
            key={e.id}
            className="border border-black/[.08] dark:border-white/[.145] rounded-md p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`text-sm font-medium ${e.type === "credit" ? "text-blue-600" : "text-red-600"}`}>
                {e.type === "credit" ? "Отдаю в долг" : "Беру в долг"} • {e.amount.toFixed(2)}
                {e.type === "debit" && e.paymentFixations && e.paymentFixations.length > 0 && (
                  <span className="ml-2 text-xs text-gray-600">
                    (осталось: {(e.amount - e.paymentFixations.reduce((sum, p) => sum + p.amount, 0)).toFixed(2)})
                  </span>
                )}
                {e.type === "credit" && e.receiptFixations && e.receiptFixations.length > 0 && (
                  <span className="ml-2 text-xs text-gray-600">
                    (осталось: {(e.amount - e.receiptFixations.reduce((sum, r) => sum + r.amount, 0)).toFixed(2)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  computeStatus(e) === "active"
                    ? "text-green-700 border-green-300 bg-green-50 dark:bg-green-950"
                    : "text-gray-600 border-gray-300 bg-gray-50 dark:bg-gray-900"
                }`}>
                  {computeStatus(e) === "active" ? "Активный" : "Архивный"}
                </span>
                <div className="text-xs text-black/60 dark:text-white/60">
                  {new Date(e.date).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="text-xs text-black/60 dark:text-white/60 space-y-1 mb-3">
              <div>Контрагент: {e.counterparty}</div>
              <div>Описание: {e.description}</div>
              {e.account && <div>Счёт: {e.account}</div>}
            </div>
            {e.type === "debit" && showPaymentFixForm === e.id ? (
              <form onSubmit={handleSubmitPaymentFix} className="space-y-2 mt-2 p-2 border border-gray-200 rounded">
                <h4 className="text-xs font-medium">Зафиксировать платеж</h4>
                
                <div>
                  <label className="block text-xs font-medium mb-1">Сумма:</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Счет списания:</label>
                  <input
                    type="text"
                    value={paymentAccount}
                    onChange={(e) => setPaymentAccount(e.target.value)}
                    disabled={isMarketplacePayment}
                    className={`w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 ${
                      isMarketplacePayment 
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed' 
                        : 'bg-background'
                    }`}
                    placeholder="Номер счета или название"
                  />
                  <div className="mt-2 flex items-center">
                    <input
                      type="checkbox"
                      id="marketplace-payment"
                      checked={isMarketplacePayment}
                      onChange={(e) => setIsMarketplacePayment(e.target.checked)}
                      className="mr-2 text-xs"
                    />
                    <label htmlFor="marketplace-payment" className="text-xs text-gray-700 dark:text-gray-300">
                      оплата с продаж на маркетплейсе
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Описание <span className="text-gray-500">(необязательно)</span>:</label>
                  <input
                    type="text"
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background"
                    placeholder="Описание платежа"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Прикрепить чек <span className="text-gray-500">(необязательно)</span>:</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setPaymentReceipt(e.target.files?.[0] || null)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                  />
                  {paymentReceipt && (
                    <div className="text-xs text-gray-600 mt-1">
                      Выбран файл: {paymentReceipt.name}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={resetPaymentFixForm}
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : e.type === "credit" && showReceiptFixForm === e.id ? (
              <form onSubmit={handleSubmitReceiptFix} className="space-y-2 mt-2 p-2 border border-gray-200 rounded">
                <h4 className="text-xs font-medium">Зафиксировать поступление</h4>
                
                <div>
                  <label className="block text-xs font-medium mb-1">Сумма:</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Счет зачисления:</label>
                  <input
                    type="text"
                    value={receiptAccount}
                    onChange={(e) => setReceiptAccount(e.target.value)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background"
                    placeholder="Номер счета или название"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Описание <span className="text-gray-500">(необязательно)</span>:</label>
                  <input
                    type="text"
                    value={receiptDescription}
                    onChange={(e) => setReceiptDescription(e.target.value)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background"
                    placeholder="Описание поступления"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Прикрепить чек <span className="text-gray-500">(необязательно)</span>:</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="w-full text-xs border border-black/[.08] dark:border-white/[.145] rounded px-2 py-1 bg-background file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                  />
                  {receiptFile && (
                    <div className="text-xs text-gray-600 mt-1">
                      Выбран файл: {receiptFile.name}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={resetReceiptFixForm}
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                {((e.paymentFixations && e.paymentFixations.length > 0) || (e.receiptFixations && e.receiptFixations.length > 0)) && (
                  <button
                    onClick={() => togglePaymentHistory(e.id)}
                    className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                  >
                    {e.type === "debit" ? `История платежей (${e.paymentFixations?.length || 0})` : `История поступлений (${e.receiptFixations?.length || 0})`}
                  </button>
                )}
                
                {e.type === "debit" && computeStatus(e) === "active" && (
                  <button
                    onClick={() => handleFixPayment(e.id)}
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 ml-2"
                  >
                    зафиксировать платеж
                  </button>
                )}
                
                {e.type === "credit" && computeStatus(e) === "active" && (
                  <button
                    onClick={() => handleFixReceipt(e.id)}
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    зафиксировать поступление
                  </button>
                )}

                {showPaymentHistory === e.id && (
                  <div className="mt-2 space-y-2">
                    {e.paymentFixations && e.paymentFixations.map((payment, index) => (
                      <div key={`payment-${index}`} className="text-xs text-green-600 bg-green-50 dark:bg-green-950 p-2 rounded border border-green-200">
                        <div className="font-medium">✓ Платеж #{index + 1}</div>
                        <div>Сумма: {payment.amount.toFixed(2)}</div>
                        <div>Счёт: {payment.account}</div>
                        {payment.description && <div>Описание: {payment.description}</div>}
                        {payment.isMarketplacePayment && <div>💳 Оплата с продаж на маркетплейсе</div>}
                        {payment.receiptFileName && <div>Чек: {payment.receiptFileName}</div>}
                        <div>Дата: {new Date(payment.fixedAt).toLocaleString()}</div>
                      </div>
                    ))}
                    {e.receiptFixations && e.receiptFixations.map((receipt, index) => (
                      <div key={`receipt-${index}`} className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200">
                        <div className="font-medium">✓ Поступление #{index + 1}</div>
                        <div>Сумма: {receipt.amount.toFixed(2)}</div>
                        <div>Счёт: {receipt.account}</div>
                        {receipt.description && <div>Описание: {receipt.description}</div>}
                        {receipt.receiptFileName && <div>Чек: {receipt.receiptFileName}</div>}
                        <div>Дата: {new Date(receipt.fixedAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


