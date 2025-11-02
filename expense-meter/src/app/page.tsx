'use client';

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_STATE, formatCurrency, formatNumber, generateId, loadState, saveState, sortEntriesByDateDesc } from "@/lib/storage";
import { Category, CategoryType, Entry } from "@/lib/types";
import { computeMonthSummaries } from "@/lib/metrics";

const CATEGORY_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-lime-100 text-lime-700",
];

const CATEGORY_TYPES: { value: CategoryType; label: string; description: string }[] = [
  {
    value: "expense",
    label: "Expense",
    description: "Tracks spending in your main currency and rolls leftover budget into next month.",
  },
  {
    value: "quantity",
    label: "Quantity",
    description: "Counts things like rides or deliveries where the unit is fixed.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Any other metric you want to meter (minutes, cups, tickets, etc.).",
  },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const pickColor = (existing: Category[]) => {
  const used = new Set(existing.map((cat) => cat.color));
  for (const color of CATEGORY_COLORS) {
    if (!used.has(color)) return color;
  }
  return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
};

interface EntryFormState {
  categoryId: string;
  date: string;
  value: string;
  note: string;
}

interface CategoryFormState {
  name: string;
  type: CategoryType;
  unit: string;
  baseBudget: string;
  monthlyTarget: string;
}

const buildDefaultEntryForm = (categories: Category[]): EntryFormState => ({
  categoryId: categories[0]?.id ?? "",
  date: todayIso(),
  value: "",
  note: "",
});

const buildDefaultCategoryForm = (): CategoryFormState => ({
  name: "",
  type: "expense",
  unit: "USD",
  baseBudget: "",
  monthlyTarget: "",
});

const ProgressBar = ({ progress }: { progress: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
    <div
      className="h-full rounded-full bg-slate-900 transition-all"
      style={{ width: `${Math.min(progress, 1) * 100}%` }}
    />
  </div>
);

const EmptyState = () => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
    Start tracking your first expense entry using the form above. All data is stored locally in your browser.
  </div>
);

export default function Home() {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_STATE.categories);
  const [entries, setEntries] = useState<Entry[]>(DEFAULT_STATE.entries);
  const [entryForm, setEntryForm] = useState<EntryFormState>(() => buildDefaultEntryForm(DEFAULT_STATE.categories));
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(buildDefaultCategoryForm);
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  useEffect(() => {
    const stored = loadState();
    if (stored) {
      const nextCategories = stored.categories.length ? stored.categories : DEFAULT_STATE.categories;
      const nextEntries = sortEntriesByDateDesc(stored.entries);

      queueMicrotask(() => {
        setCategories(nextCategories);
        setEntries(nextEntries);
        setEntryForm((prev) => ({
          ...prev,
          categoryId: nextCategories[0]?.id ?? prev.categoryId,
        }));
      });
    }
  }, []);

  useEffect(() => {
    saveState({ categories, entries });
  }, [categories, entries]);

  const currencyCode = useMemo(() => {
    return categories.find((cat) => cat.type === "expense")?.unit || "USD";
  }, [categories]);

  const sortedEntries = useMemo(() => sortEntriesByDateDesc(entries), [entries]);

  const monthSummaries = useMemo(() => computeMonthSummaries(categories, entries), [categories, entries]);
  const currentMonthSummary = monthSummaries[0];

  const handleEntrySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryForm.categoryId) return;

    const category = categories.find((cat) => cat.id === entryForm.categoryId);
    if (!category) return;

    const numericValue = Number(entryForm.value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;

    const nextEntry: Entry = {
      id: generateId(),
      categoryId: category.id,
      date: entryForm.date,
      value: numericValue,
      note: entryForm.note.trim() || undefined,
      createdAt: Date.now(),
    };

    setEntries((prev) => sortEntriesByDateDesc([nextEntry, ...prev]));
    setEntryForm((prev) => ({ ...prev, value: "", note: "" }));
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleCategoryFormChange = <K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) => {
    setCategoryForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateCategory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryForm.name.trim()) return;

    const budgetValue = Number(categoryForm.baseBudget);
    const targetValue = Number(categoryForm.monthlyTarget);

    const newCategory: Category = {
      id: generateId(),
      name: categoryForm.name.trim(),
      type: categoryForm.type,
      unit: categoryForm.unit || (categoryForm.type === "expense" ? currencyCode : "units"),
      baseBudget: categoryForm.type === "expense" && Number.isFinite(budgetValue) && budgetValue > 0 ? budgetValue : undefined,
      monthlyTarget: categoryForm.type !== "expense" && Number.isFinite(targetValue) && targetValue > 0 ? targetValue : undefined,
      color: pickColor(categories),
    };

    setCategories((prev) => [newCategory, ...prev]);
    setEntryForm(buildDefaultEntryForm([newCategory, ...categories]));
    setCategoryForm(buildDefaultCategoryForm());
    setShowCategoryForm(false);
  };

  const handleRemoveCategory = (categoryId: string) => {
    setCategories((prev) => {
      const next = prev.filter((cat) => cat.id !== categoryId);
      if (next.length !== prev.length) {
        setEntryForm((current) => {
          if (current.categoryId === categoryId) {
            return {
              ...current,
              categoryId: next[0]?.id ?? "",
            };
          }
          return current;
        });
      }
      return next;
    });
    setEntries((prev) => prev.filter((entry) => entry.categoryId !== categoryId));
  };

  const handleUpdateNumericField = (categoryId: string, field: "baseBudget" | "monthlyTarget", raw: string) => {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;

        if (raw === "") {
          return { ...category, [field]: undefined } as Category;
        }

        const numeric = Number(raw);
        return {
          ...category,
          [field]: Number.isFinite(numeric) && numeric >= 0 ? numeric : category[field],
        };
      }),
    );
  };

  const entryCategory = categories.find((cat) => cat.id === entryForm.categoryId);
  const entryLabel = entryCategory?.type === "expense" ? "Amount" : `How many ${entryCategory?.unit}?`;

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 sm:px-10">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-slate-500">Expense Meter</p>
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">Track your days, carry your wins</h1>
          <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
            Monitor daily spending, track alternative metrics like rides or cups, and automatically roll unused budget into the next month.
          </p>
        </header>

        {currentMonthSummary && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Current Month</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{currentMonthSummary.label}</p>
              <p className="mt-4 text-sm text-slate-500">Budget Available</p>
              <p className="text-xl font-semibold text-slate-900">{formatCurrency(currentMonthSummary.available, currencyCode)}</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Spent so far</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(currentMonthSummary.totalExpense, currencyCode)}</p>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                <span>Base budget</span>
                <span>{formatCurrency(currentMonthSummary.baseBudget, currencyCode)}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Carryover ready</p>
              <p className={`mt-1 text-2xl font-semibold ${currentMonthSummary.carryover >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatCurrency(currentMonthSummary.carryover, currencyCode)}
              </p>
              <p className="mt-4 text-sm text-slate-500">Rolls into next month automatically</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Entries logged</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{sortedEntries.length}</p>
              <p className="mt-4 text-sm text-slate-500">Everything is stored locally in this browser.</p>
            </div>
          </section>
        )}

        <section className="grid gap-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-medium text-slate-900">Log new entry</h2>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleEntrySubmit}>
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-slate-700">Category</span>
                <select
                  value={entryForm.categoryId}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  required
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-slate-700">Date</span>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  max={todayIso()}
                  required
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-slate-700">{entryLabel}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={entryForm.value}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, value: event.target.value }))}
                  placeholder={entryCategory?.type === "expense" ? `0.00 ${entryCategory.unit || currencyCode}` : `0 ${entryCategory?.unit ?? "units"}`}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  required
                />
              </label>

              <label className="flex flex-col gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Note (optional)</span>
                <input
                  type="text"
                  value={entryForm.note}
                  onChange={(event) => setEntryForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="What was this for?"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                />
              </label>

              <button
                type="submit"
                className="sm:col-span-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
              >
                Save entry
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Categories</h2>
              <button
                onClick={() => setShowCategoryForm((prev) => !prev)}
                className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
              >
                {showCategoryForm ? "Close" : "Add"}
              </button>
            </div>

            {showCategoryForm && (
              <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm" onSubmit={handleCreateCategory}>
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Name</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(event) => handleCategoryFormChange("name", event.target.value)}
                    placeholder="Transportation, Drinks, etc."
                    className="rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Type</label>
                  <select
                    value={categoryForm.type}
                    onChange={(event) => handleCategoryFormChange("type", event.target.value as CategoryType)}
                    className="rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  >
                    {CATEGORY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">{CATEGORY_TYPES.find((type) => type.value === categoryForm.type)?.description}</p>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Unit</label>
                  <input
                    type="text"
                    value={categoryForm.unit}
                    onChange={(event) => handleCategoryFormChange("unit", event.target.value)}
                    placeholder="USD, rides, cups..."
                    className="rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    required
                  />
                </div>

                {categoryForm.type === "expense" ? (
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">Monthly budget</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={categoryForm.baseBudget}
                      onChange={(event) => handleCategoryFormChange("baseBudget", event.target.value)}
                      placeholder="0.00"
                      className="rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">Monthly target</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={categoryForm.monthlyTarget}
                      onChange={(event) => handleCategoryFormChange("monthlyTarget", event.target.value)}
                      placeholder="0"
                      className="rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                )}

                <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                  Save category
                </button>
              </form>
            )}

            <ul className="grid gap-3 text-sm">
              {categories.map((category) => (
                <li key={category.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${category.color ?? "bg-slate-200 text-slate-700"}`}>
                          {category.type.toUpperCase()}
                        </span>
                        <p className="text-sm font-semibold text-slate-900">{category.name}</p>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">Unit: {category.unit}</p>
                    </div>
                    <button
                      className="text-xs font-semibold uppercase text-rose-600"
                      onClick={() => handleRemoveCategory(category.id)}
                    >
                      Remove
                    </button>
                  </div>
                  {category.type === "expense" ? (
                    <label className="mt-3 flex flex-col gap-1 text-xs">
                      <span className="font-semibold text-slate-500">Monthly budget</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={category.baseBudget ?? ""}
                        placeholder="0.00"
                        onChange={(event) => handleUpdateNumericField(category.id, "baseBudget", event.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                  ) : (
                    <label className="mt-3 flex flex-col gap-1 text-xs">
                      <span className="font-semibold text-slate-500">Monthly target</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={category.monthlyTarget ?? ""}
                        placeholder="0"
                        onChange={(event) => handleUpdateNumericField(category.id, "monthlyTarget", event.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-slate-900">Category meters</h2>
              <p className="mt-1 text-sm text-slate-500">See how each category is performing this month.</p>
              <div className="mt-6 space-y-5">
                {currentMonthSummary?.categories.map(({ category, value, availableBudget, carryover, progress }) => (
                  <div key={category.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{category.name}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">{category.type === "expense" ? "Budget" : "Target"}</p>
                      </div>
                      <div className="text-right text-sm text-slate-700">
                        {category.type === "expense" ? (
                          <>
                            <p>{formatCurrency(value, category.unit || currencyCode)}</p>
                            <p className="text-xs text-slate-500">spent of {formatCurrency(availableBudget ?? 0, category.unit || currencyCode)}</p>
                          </>
                        ) : (
                          <>
                            <p>{formatNumber(value)} {category.unit}</p>
                            {category.monthlyTarget ? (
                              <p className="text-xs text-slate-500">target {formatNumber(category.monthlyTarget)} {category.unit}</p>
                            ) : (
                              <p className="text-xs text-slate-500">no target set</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {typeof progress === "number" && (
                      <div className="mt-3">
                        <ProgressBar progress={progress} />
                        <p className="mt-1 text-xs text-slate-500">{Math.round(progress * 100)}% of goal</p>
                      </div>
                    )}
                    {category.type === "expense" && (
                      <p className={`mt-3 text-xs font-semibold ${Number(carryover) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {Number(carryover) >= 0 ? "Carryover" : "Overspent"}: {formatCurrency(carryover ?? 0, category.unit || currencyCode)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-slate-900">Monthly timeline</h2>
              <p className="mt-1 text-sm text-slate-500">Balances roll forward automatically when you end the month with a surplus.</p>
              <div className="mt-6 space-y-4">
                {monthSummaries.map((summary) => (
                  <div key={summary.key} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{summary.label}</p>
                        <p className="text-xs text-slate-500">{summary.categories.filter((cat) => cat.category.type === "expense").length} expense categories</p>
                      </div>
                      <div className="text-right text-sm text-slate-700">
                        <p>{formatCurrency(summary.totalExpense, currencyCode)} spent</p>
                        <p className="text-xs text-slate-500">{formatCurrency(summary.available, currencyCode)} available</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <p>Base budget: {formatCurrency(summary.baseBudget, currencyCode)}</p>
                      <p>Carryover next month: {formatCurrency(summary.carryover, currencyCode)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-slate-900">Recent entries</h2>
              <p className="mt-1 text-sm text-slate-500">Log your daily movements and clean them up if needed.</p>
              <div className="mt-6 space-y-3">
                {sortedEntries.length === 0 && <EmptyState />}
                {sortedEntries.map((entry) => {
                  const category = categories.find((cat) => cat.id === entry.categoryId);
                  if (!category) return null;
                  return (
                    <div key={entry.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-slate-900">{category.name}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">{new Date(entry.date).toLocaleDateString()}</p>
                        {entry.note && <p className="mt-1 text-xs text-slate-500">{entry.note}</p>}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-900">
                          {category.type === "expense"
                            ? formatCurrency(entry.value, category.unit || currencyCode)
                            : `${formatNumber(entry.value)} ${category.unit}`}
                        </span>
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="text-xs font-semibold uppercase tracking-wide text-rose-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
