"use client";

import { useMemo, useState } from "react";

type Point = { lat: number; lng: number };
type Merchant = {
  id: string;
  brand: string;
  category: string;
  branch: string;
  area: string;
  deviceId: string;
  onboarded: Point;
  actual: Point;
  risk: "Low" | "Medium" | "High";
  avgTicket: number;
  tx30d: number;
};
type Customer = {
  id: string;
  segment: string;
  home: Point;
  work: Point;
  frequentAreas: string[];
  loyaltyBrands: string[];
  tx90d: number;
};
type CustomerHistoryTxn = {
  id: string;
  dayOffset: number;
  merchantId: string;
  shop: string;
  area: string;
  brand: string;
  amount: number;
  hour: number;
  point: Point;
};
type CustomerHistorySummary = {
  transactions: CustomerHistoryTxn[];
  areaCounts: Record<string, number>;
  brandCounts: Record<string, number>;
  merchantCounts: Record<string, number>;
  avgAmountByBrand: Record<string, number>;
  total: number;
};
type Candidate = Merchant & {
  distanceHome: number;
  distanceWork: number;
  catchment: number;
  repeat: number;
  behavior: number;
  ticket: number;
  timeFit: number;
  onboarding: number;
  historyArea: number;
  historyBrand: number;
  historyShop: number;
  historyProximity: number;
  historyTicket: number;
  score: number;
  confidence: number;
  reasons: string[];
};
type ScenarioConfig = {
  seed: number;
  customerIndex: number;
  brand: string;
  amount: number;
  hour: number;
  deviceIndex: number;
  deviceId: string;
  registeredArea: string;
  registeredLat: number;
  registeredLng: number;
};
type View = "overview" | "transactions" | "movement" | "charts" | "customers" | "devices";
type TransactionRecord = {
  id: string;
  date: string;
  deviceId: string;
  customerId: string;
  brand: string;
  amount: number;
  registeredArea: string;
  inferredArea: string;
  suggestedShop: string;
  correctionKm: number;
  confidence: number;
  status: "Accurate" | "Review" | "Incorrect";
};

const scoreWeights = {
  catchment: 0.18,
  behavior: 0.12,
  repeat: 0.08,
  ticket: 0.09,
  timeFit: 0.08,
  onboarding: 0.08,
  historyArea: 0.13,
  historyBrand: 0.09,
  historyShop: 0.08,
  historyProximity: 0.05,
  historyTicket: 0.02,
} as const;

const areas = [
  { name: "Dubai Marina", lat: 25.0802, lng: 55.1403 },
  { name: "JLT", lat: 25.0694, lng: 55.1413 },
  { name: "Downtown", lat: 25.1972, lng: 55.2744 },
  { name: "Business Bay", lat: 25.1867, lng: 55.2666 },
  { name: "Deira", lat: 25.2697, lng: 55.3095 },
  { name: "Bur Dubai", lat: 25.2532, lng: 55.2972 },
  { name: "Jumeirah", lat: 25.2048, lng: 55.2447 },
  { name: "Mirdif", lat: 25.2161, lng: 55.4073 },
  { name: "Al Barsha", lat: 25.1124, lng: 55.2004 },
  { name: "Silicon Oasis", lat: 25.1235, lng: 55.3812 },
  { name: "Dubai Hills", lat: 25.1033, lng: 55.2405 },
  { name: "Palm Jumeirah", lat: 25.1124, lng: 55.139 },
];

const brandPool = [
  ["McDonald's", "QSR", 37],
  ["Carrefour", "Grocery", 92],
  ["ENOC", "Fuel", 126],
  ["Starbucks", "Cafe", 44],
  ["Life Pharmacy", "Pharmacy", 58],
  ["Noon Minutes", "Convenience", 35],
  ["Spinneys", "Grocery", 118],
  ["KFC", "QSR", 41],
  ["Lulu", "Grocery", 76],
  ["Costa Coffee", "Cafe", 39],
] as const;

const seeded = (seed: number) => {
  let value = seed % 2147483647;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
};

const jitter = (base: Point, rand: () => number, radius = 0.014): Point => ({
  lat: base.lat + (rand() - 0.5) * radius,
  lng: base.lng + (rand() - 0.5) * radius,
});

const km = (a: Point, b: Point) => {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

function buildScenarioConfig(seed: number): ScenarioConfig {
  const rand = seeded(seed * 991);
  const customerIndex = Math.floor(rand() * 10000);
  const preferredBrand = brandPool[Math.floor(rand() * brandPool.length)][0];
  const brand = rand() > 0.28 ? preferredBrand : "McDonald's";
  const brandMeta = brandPool.find((brandItem) => brandItem[0] === brand) || brandPool[0];
  const hour = [8, 12, 18, 21][Math.floor(rand() * 4)];
  const amount = Math.round(Number(brandMeta[2]) * (0.65 + rand() * 0.85));
  const deviceIndex = Math.floor(rand() * 2000);
  const registeredArea = areas[Math.floor(rand() * areas.length)];
  const registeredPoint = jitter(registeredArea, rand, 0.018);

  return {
    seed,
    customerIndex,
    brand,
    amount,
    hour,
    deviceIndex,
    deviceId: `PI-POS-${(7000000 + deviceIndex).toString()}`,
    registeredArea: registeredArea.name,
    registeredLat: Number(registeredPoint.lat.toFixed(5)),
    registeredLng: Number(registeredPoint.lng.toFixed(5)),
  };
}

function buildDataset() {
  const rand = seeded(811);
  const merchants: Merchant[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const brand = brandPool[i % brandPool.length];
    const area = areas[Math.floor(rand() * areas.length)];
    const moved = rand() > 0.82;
    const actual = jitter(area, rand, 0.018);
    const onboardedArea = moved ? areas[Math.floor(rand() * areas.length)] : area;
    merchants.push({
      id: `M-${(100000 + i).toString()}`,
      brand: brand[0],
      category: brand[1],
      branch: `${area.name} ${Math.floor(rand() * 16) + 1}`,
      area: area.name,
      deviceId: `PI-POS-${(7000000 + i).toString()}`,
      onboarded: jitter(onboardedArea, rand, 0.02),
      actual,
      risk: moved ? "High" : rand() > 0.72 ? "Medium" : "Low",
      avgTicket: brand[2] + Math.round((rand() - 0.5) * brand[2] * 0.7),
      tx30d: 120 + Math.floor(rand() * 7600),
    });
  }

  const customers: Customer[] = [];
  for (let i = 0; i < 10000; i += 1) {
    const homeArea = areas[Math.floor(rand() * areas.length)];
    const workArea = areas[Math.floor(rand() * areas.length)];
    const brandA = brandPool[Math.floor(rand() * brandPool.length)][0];
    const brandB = brandPool[Math.floor(rand() * brandPool.length)][0];
    customers.push({
      id: `C-${(90000000 + i).toString()}`,
      segment: ["Resident", "Commuter", "Tourist-like", "Office cluster"][
        Math.floor(rand() * 4)
      ],
      home: jitter(homeArea, rand, 0.03),
      work: jitter(workArea, rand, 0.026),
      frequentAreas: [homeArea.name, workArea.name],
      loyaltyBrands: [brandA, brandB],
      tx90d: 8 + Math.floor(rand() * 94),
    });
  }
  return { merchants, customers };
}

function buildCustomerHistory(
  customer: Customer,
  merchants: Merchant[],
  seed: number,
): CustomerHistorySummary {
  const rand = seeded(seed + Number(customer.id.replace("C-", "")));
  const transactions: CustomerHistoryTxn[] = [];
  const preferredMerchants = merchants.filter(
    (merchant) =>
      customer.frequentAreas.includes(merchant.area) ||
      customer.loyaltyBrands.includes(merchant.brand),
  );
  const pool = preferredMerchants.length > 0 ? preferredMerchants : merchants;

  for (let i = 0; i < customer.tx90d; i += 1) {
    const merchant = pool[Math.floor(rand() * pool.length)];
    const dayOffset = Math.floor(rand() * 90);
    const amount = Math.max(6, Math.round(merchant.avgTicket * (0.55 + rand() * 1.2)));
    const hour = [7, 9, 12, 18, 21, 23][Math.floor(rand() * 6)];

    transactions.push({
      id: `H-${customer.id.slice(2)}-${String(i + 1).padStart(3, "0")}`,
      dayOffset,
      merchantId: merchant.id,
      shop: merchant.branch,
      area: merchant.area,
      brand: merchant.brand,
      amount,
      hour,
      point: merchant.actual,
    });
  }

  const areaCounts: Record<string, number> = {};
  const brandCounts: Record<string, number> = {};
  const merchantCounts: Record<string, number> = {};
  const amountByBrand: Record<string, number[]> = {};

  transactions.forEach((tx) => {
    areaCounts[tx.area] = (areaCounts[tx.area] || 0) + 1;
    brandCounts[tx.brand] = (brandCounts[tx.brand] || 0) + 1;
    merchantCounts[tx.merchantId] = (merchantCounts[tx.merchantId] || 0) + 1;
    amountByBrand[tx.brand] = [...(amountByBrand[tx.brand] || []), tx.amount];
  });

  const avgAmountByBrand = Object.fromEntries(
    Object.entries(amountByBrand).map(([brand, amounts]) => [
      brand,
      Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length),
    ]),
  );

  return {
    transactions: transactions.sort((a, b) => a.dayOffset - b.dayOffset),
    areaCounts,
    brandCounts,
    merchantCounts,
    avgAmountByBrand,
    total: transactions.length,
  };
}

function scoreCandidates(
  merchants: Merchant[],
  customer: Customer,
  observedBrand: string,
  amount: number,
  hour: number,
  deviceOnboarded?: Point,
  history?: CustomerHistorySummary,
): Candidate[] {
  return merchants
    .filter((merchant) => merchant.brand === observedBrand)
    .map((merchant) => {
      const distanceHome = km(customer.home, merchant.actual);
      const distanceWork = km(customer.work, merchant.actual);
      const catchment = clamp(1 - Math.min(distanceHome, distanceWork) / 18);
      const repeat = customer.loyaltyBrands.includes(merchant.brand) ? 0.92 : 0.42;
      const behavior = customer.frequentAreas.includes(merchant.area) ? 0.94 : 0.38;
      const ticket = clamp(1 - Math.abs(amount - merchant.avgTicket) / 180);
      const historyArea = history
        ? clamp((history.areaCounts[merchant.area] || 0) / Math.max(1, history.total) / 0.35)
        : behavior;
      const historyBrand = history
        ? clamp((history.brandCounts[merchant.brand] || 0) / Math.max(1, history.total) / 0.3)
        : repeat;
      const historyShop = history
        ? clamp((history.merchantCounts[merchant.id] || 0) / Math.max(1, history.total) / 0.16)
        : 0.2;
      const nearestHistoryKm = history?.transactions.length
        ? Math.min(...history.transactions.map((tx) => km(tx.point, merchant.actual)))
        : 18;
      const historyProximity = clamp(1 - nearestHistoryKm / 12);
      const historyBrandAvg = history?.avgAmountByBrand[merchant.brand] || merchant.avgTicket;
      const historyTicket = clamp(1 - Math.abs(amount - historyBrandAvg) / 180);
      const timeFit =
        hour >= 7 && hour <= 10
          ? clamp(1 - distanceWork / 15)
          : hour >= 18 && hour <= 23
            ? clamp(1 - distanceHome / 15)
            : 0.7;
      const onboarding = clamp(1 - km(deviceOnboarded || merchant.onboarded, merchant.actual) / 25);
      const densityPenalty = merchant.tx30d > 6000 ? 0.04 : 0;
      const score =
        catchment * scoreWeights.catchment +
        behavior * scoreWeights.behavior +
        repeat * scoreWeights.repeat +
        ticket * scoreWeights.ticket +
        timeFit * scoreWeights.timeFit +
        onboarding * scoreWeights.onboarding +
        historyArea * scoreWeights.historyArea +
        historyBrand * scoreWeights.historyBrand +
        historyShop * scoreWeights.historyShop +
        historyProximity * scoreWeights.historyProximity +
        historyTicket * scoreWeights.historyTicket -
        densityPenalty;
      const reasons = [
        `${Math.min(distanceHome, distanceWork).toFixed(1)} km from likely customer orbit`,
        `${history?.areaCounts[merchant.area] || 0} prior tx in ${merchant.area}`,
        `${Math.round(ticket * 100)}% amount fit`,
        `${Math.round(onboarding * 100)}% device-record consistency`,
      ];
      return {
        ...merchant,
        distanceHome,
        distanceWork,
        catchment,
        repeat,
        behavior,
        ticket,
        timeFit,
        onboarding,
        historyArea,
        historyBrand,
        historyShop,
        historyProximity,
        historyTicket,
        score,
        confidence: Math.round(score * 100),
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildRecentTransactions(merchants: Merchant[], customers: Customer[]) {
  const rand = seeded(20260709);
  const transactions: TransactionRecord[] = [];

  for (let i = 0; i < 90; i += 1) {
    const merchant = merchants[Math.floor(rand() * merchants.length)];
    const customer = customers[Math.floor(rand() * customers.length)];
    const amount = Math.max(8, Math.round(merchant.avgTicket * (0.58 + rand() * 1.12)));
    const hour = [8, 11, 14, 18, 21][Math.floor(rand() * 5)];
    const candidates = scoreCandidates(
      merchants,
      customer,
      merchant.brand,
      amount,
      hour,
      merchant.onboarded,
      buildCustomerHistory(customer, merchants, i + 900),
    );
    const inferred = candidates[0];
    const correctionKm = km(merchant.onboarded, inferred.actual);
    const status =
      correctionKm >= 8 ? "Incorrect" : correctionKm >= 1 ? "Review" : "Accurate";

    transactions.push({
      id: `TX-${(600000 + i).toString()}`,
      date: `2026-${String(7 - Math.floor(i / 31)).padStart(2, "0")}-${String(
        28 - (i % 28),
      ).padStart(2, "0")}`,
      deviceId: merchant.deviceId,
      customerId: customer.id,
      brand: merchant.brand,
      amount,
      registeredArea: areaNameFromPoint(merchant.onboarded),
      inferredArea: inferred.area,
      suggestedShop: inferred.branch,
      correctionKm,
      confidence: inferred.confidence,
      status,
    });
  }

  return transactions;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const pts = (value: number) => `${(value * 100).toFixed(1)} pts`;
const kmText = (value: number) => `${value.toFixed(2)} km`;
const coord = (value: number) => value.toFixed(5);
const areaNameFromPoint = (point: Point) =>
  areas.reduce((nearest, area) => (km(point, area) < km(point, nearest) ? area : nearest)).name;
const countBy = <T,>(items: T[], getKey: (item: T) => string) =>
  items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
const toChartRows = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
const chartColor = (index: number) =>
  ["#0077b6", "#1f9d7a", "#d98c21", "#8b5cf6", "#d64f4f", "#405269"][index % 6];

export default function Home() {
  const { merchants, customers } = useMemo(() => buildDataset(), []);
  const [activeView, setActiveView] = useState<View>("overview");
  const [config, setConfig] = useState<ScenarioConfig>(() => buildScenarioConfig(32));
  const [draftConfig, setDraftConfig] = useState<ScenarioConfig>(() => buildScenarioConfig(32));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const recentTransactions = useMemo(
    () => buildRecentTransactions(merchants, customers),
    [customers, merchants],
  );
  const scenario = useMemo(() => {
    const customer = customers[config.customerIndex % customers.length];
    const history = buildCustomerHistory(customer, merchants, config.seed);
    const registeredPoint = {
      lat: config.registeredLat,
      lng: config.registeredLng,
    };
    const baseDevice = merchants[config.deviceIndex % merchants.length];
    const deviceRecord = {
      ...baseDevice,
      deviceId: config.deviceId,
      onboarded: registeredPoint,
    };
    const candidates = scoreCandidates(
      merchants,
      customer,
      config.brand,
      config.amount,
      config.hour,
      registeredPoint,
      history,
    );
    return {
      customer,
      history,
      deviceRecord,
      observedBrand: config.brand,
      amount: config.amount,
      hour: config.hour,
      candidates,
      winner: candidates[0],
      second: candidates[1],
    };
  }, [config, customers, merchants]);
  const selectedCandidate =
    scenario.candidates.find((candidate) => candidate.id === selectedCandidateId) ||
    scenario.winner;
  const selectedRank =
    scenario.candidates.findIndex((candidate) => candidate.id === selectedCandidate.id) + 1;
  const densityPenalty = selectedCandidate.tx30d > 6000 ? 0.04 : 0;
  const currentDeviceArea = areaNameFromPoint(scenario.deviceRecord.onboarded);
  const inferredDeviceArea = selectedCandidate.area;
  const correctionDistance = km(scenario.deviceRecord.onboarded, selectedCandidate.actual);
  const correctionNeeded = correctionDistance >= 1;
  const mapPoints = [
    scenario.deviceRecord.onboarded,
    selectedCandidate.actual,
    scenario.customer.home,
    scenario.customer.work,
    ...scenario.candidates.map((candidate) => candidate.actual),
  ];
  const latValues = mapPoints.map((point) => point.lat);
  const lngValues = mapPoints.map((point) => point.lng);
  const minLat = Math.min(...latValues) - 0.01;
  const maxLat = Math.max(...latValues) + 0.01;
  const minLng = Math.min(...lngValues) - 0.01;
  const maxLng = Math.max(...lngValues) + 0.01;
  const mapPosition = (point: Point) => ({
    left: `${8 + ((point.lng - minLng) / Math.max(0.001, maxLng - minLng)) * 84}%`,
    top: `${8 + ((maxLat - point.lat) / Math.max(0.001, maxLat - minLat)) * 84}%`,
  });
  const scoringRows = [
    {
      label: "Customer orbit",
      raw: `Nearest of home ${kmText(selectedCandidate.distanceHome)} / work ${kmText(
        selectedCandidate.distanceWork,
      )}`,
      value: selectedCandidate.catchment,
      weight: scoreWeights.catchment,
      contribution: selectedCandidate.catchment * scoreWeights.catchment,
    },
    {
      label: "Area behavior",
      raw: scenario.customer.frequentAreas.includes(selectedCandidate.area)
        ? `${selectedCandidate.area} is in frequent areas`
        : `${selectedCandidate.area} not in frequent areas`,
      value: selectedCandidate.behavior,
      weight: scoreWeights.behavior,
      contribution: selectedCandidate.behavior * scoreWeights.behavior,
    },
    {
      label: "Repeat brand",
      raw: scenario.customer.loyaltyBrands.includes(selectedCandidate.brand)
        ? `${selectedCandidate.brand} is a loyalty brand`
        : `${selectedCandidate.brand} is not a loyalty brand`,
      value: selectedCandidate.repeat,
      weight: scoreWeights.repeat,
      contribution: selectedCandidate.repeat * scoreWeights.repeat,
    },
    {
      label: "Ticket fit",
      raw: `AED ${scenario.amount} transaction vs AED ${selectedCandidate.avgTicket} shop avg`,
      value: selectedCandidate.ticket,
      weight: scoreWeights.ticket,
      contribution: selectedCandidate.ticket * scoreWeights.ticket,
    },
    {
      label: "Time fit",
      raw:
        scenario.hour >= 7 && scenario.hour <= 10
          ? "Morning transaction weighted toward work orbit"
          : scenario.hour >= 18 && scenario.hour <= 23
            ? "Evening transaction weighted toward home orbit"
            : "Midday transaction gets neutral time fit",
      value: selectedCandidate.timeFit,
      weight: scoreWeights.timeFit,
      contribution: selectedCandidate.timeFit * scoreWeights.timeFit,
    },
    {
      label: "Device record fit",
      raw: `${kmText(correctionDistance)} between current device record and candidate shop`,
      value: selectedCandidate.onboarding,
      weight: scoreWeights.onboarding,
      contribution: selectedCandidate.onboarding * scoreWeights.onboarding,
    },
    {
      label: "History area visits",
      raw: `${scenario.history.areaCounts[selectedCandidate.area] || 0} of ${
        scenario.history.total
      } prior tx in ${selectedCandidate.area}`,
      value: selectedCandidate.historyArea,
      weight: scoreWeights.historyArea,
      contribution: selectedCandidate.historyArea * scoreWeights.historyArea,
    },
    {
      label: "History brand visits",
      raw: `${scenario.history.brandCounts[selectedCandidate.brand] || 0} prior ${
        selectedCandidate.brand
      } transactions`,
      value: selectedCandidate.historyBrand,
      weight: scoreWeights.historyBrand,
      contribution: selectedCandidate.historyBrand * scoreWeights.historyBrand,
    },
    {
      label: "Same-shop repeats",
      raw: `${scenario.history.merchantCounts[selectedCandidate.id] || 0} prior tx at this shop`,
      value: selectedCandidate.historyShop,
      weight: scoreWeights.historyShop,
      contribution: selectedCandidate.historyShop * scoreWeights.historyShop,
    },
    {
      label: "History proximity",
      raw: `Nearest historical shop is ${kmText(
        Math.min(...scenario.history.transactions.map((tx) => km(tx.point, selectedCandidate.actual))),
      )} from this candidate`,
      value: selectedCandidate.historyProximity,
      weight: scoreWeights.historyProximity,
      contribution: selectedCandidate.historyProximity * scoreWeights.historyProximity,
    },
    {
      label: "History ticket fit",
      raw: `AED ${scenario.amount} vs AED ${
        scenario.history.avgAmountByBrand[selectedCandidate.brand] || selectedCandidate.avgTicket
      } customer avg for this brand`,
      value: selectedCandidate.historyTicket,
      weight: scoreWeights.historyTicket,
      contribution: selectedCandidate.historyTicket * scoreWeights.historyTicket,
    },
  ];
  const positiveScore = scoringRows.reduce((sum, row) => sum + row.contribution, 0);

  const matchGap = scenario.second
    ? scenario.winner.confidence - scenario.second.confidence
    : scenario.winner.confidence;
  const accurateTx = recentTransactions.filter((tx) => tx.status === "Accurate").length;
  const reviewTx = recentTransactions.filter((tx) => tx.status === "Review").length;
  const incorrectTx = recentTransactions.filter((tx) => tx.status === "Incorrect").length;
  const movementRows = merchants.slice(0, 80).map((merchant) => {
    const driftKm = km(merchant.onboarded, merchant.actual);
    const registeredArea = areaNameFromPoint(merchant.onboarded);
    const movementStatus =
      driftKm >= 8
        ? "Different merchant location"
        : driftKm >= 1
          ? "Same merchant, different store"
          : "Same store/location";

    return {
      ...merchant,
      driftKm,
      registeredArea,
      movementStatus,
    };
  });
  const sameStoreDevices = movementRows.filter(
    (device) => device.movementStatus === "Same store/location",
  ).length;
  const differentStoreDevices = movementRows.filter(
    (device) => device.movementStatus === "Same merchant, different store",
  ).length;
  const differentMerchantLocationDevices = movementRows.filter(
    (device) => device.movementStatus === "Different merchant location",
  ).length;
  const categoryRows = toChartRows(countBy(merchants, (merchant) => merchant.category));
  const transactionStatusRows = toChartRows(countBy(recentTransactions, (tx) => tx.status));
  const highRiskDevices = merchants.filter((merchant) => merchant.risk === "High").length;
  const mediumRiskDevices = merchants.filter((merchant) => merchant.risk === "Medium").length;
  const reviewQueue = reviewTx + incorrectTx;
  const reviewQueueRate = Math.round((reviewQueue / Math.max(1, recentTransactions.length)) * 100);
  const avgCorrectionKm =
    recentTransactions.reduce((sum, tx) => sum + tx.correctionKm, 0) /
    Math.max(1, recentTransactions.length);
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.count, 0);
  const topCategories = categoryRows.slice(0, 6);
  const pieGradient = topCategories
    .reduce(
      (parts, row, index) => {
        const start = parts.cursor;
        const end = start + (row.count / Math.max(1, categoryTotal)) * 100;
        return {
          cursor: end,
          segments: [
            ...parts.segments,
            `${chartColor(index)} ${start.toFixed(2)}% ${end.toFixed(2)}%`,
          ],
        };
      },
      { cursor: 0, segments: [] as string[] },
    )
    .segments.join(", ");

  const openSimulationModal = () => {
    setDraftConfig(buildScenarioConfig(config.seed + 1));
    setIsModalOpen(true);
  };

  const updateDraft = (field: keyof ScenarioConfig, value: string) => {
    setDraftConfig((current) => {
      const numericFields: Array<keyof ScenarioConfig> = [
        "seed",
        "customerIndex",
        "amount",
        "hour",
        "deviceIndex",
        "registeredLat",
        "registeredLng",
      ];

      return {
        ...current,
        [field]: numericFields.includes(field) ? Number(value) : value,
      };
    });
  };

  const applySimulation = () => {
    setConfig(draftConfig);
    setSelectedCandidateId(null);
    setActiveView("overview");
    setIsModalOpen(false);
  };

  const setDraftDevice = (deviceIndex: number) => {
    const device = merchants[deviceIndex % merchants.length];
    setDraftConfig((current) => ({
      ...current,
      deviceIndex,
      deviceId: device.deviceId,
      brand: device.brand,
      registeredArea: areaNameFromPoint(device.onboarded),
      registeredLat: Number(device.onboarded.lat.toFixed(5)),
      registeredLng: Number(device.onboarded.lng.toFixed(5)),
    }));
  };

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Payment International Location Intelligence</p>
          <h1>Correct POS device geolocation from transaction evidence.</h1>
          <p className="intro">
            A demo analytics platform that starts with the device&apos;s current
            registered location, infers its approximate physical lat/lng, and
            flags the right shop assignment when the device is tied to the wrong
            area or shop.
          </p>
        </div>
        <div className="heroActions">
          <button className="primary" onClick={openSimulationModal}>
            Simulate new transaction
          </button>
          <span className="demoPill">Demo population: 10k customers / 2k POS devices</span>
        </div>
      </section>

      <nav className="menuBar" aria-label="app views">
        {[
          ["overview", "Live correction"],
          ["transactions", "90-day transactions"],
          ["movement", "Device movement"],
          ["charts", "Category charts"],
          ["devices", "Devices data"],
          ["customers", "Customers data"],
        ].map(([view, label]) => (
          <button
            className={activeView === view ? "activeMenuItem" : ""}
            key={view}
            onClick={() => setActiveView(view as View)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="metrics" aria-label="portfolio metrics">
        <button className="metricButton" onClick={() => setActiveView("devices")} type="button">
          <span>Devices monitored</span>
          <strong>2,000</strong>
          <small>Open full POS device table</small>
        </button>
        <button className="metricButton" onClick={() => setActiveView("customers")} type="button">
          <span>Customers modeled</span>
          <strong>10,000</strong>
          <small>Open full customer sample table</small>
        </button>
        <button className="metricButton" onClick={() => setActiveView("transactions")} type="button">
          <span>Needs review</span>
          <strong>{reviewTx + incorrectTx}</strong>
          <small>{incorrectTx} incorrect in red / {reviewTx} review</small>
        </button>
        <button className="metricButton" onClick={() => setActiveView("movement")} type="button">
          <span>Geolocation confidence</span>
          <strong>{scenario.winner.confidence}%</strong>
          <small>{matchGap} pt lead over next shop</small>
        </button>
      </section>

      {activeView === "overview" && (
        <>
      <section className="workspace">
        <aside className="transactionPanel">
          <div className="panelHeader">
            <span>POS event</span>
            <strong>{scenario.observedBrand}</strong>
          </div>
          <dl>
            <div>
              <dt>Device</dt>
              <dd>{scenario.deviceRecord.deviceId}</dd>
            </div>
            <div>
              <dt>Current device label</dt>
              <dd>{currentDeviceArea}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>{scenario.customer.id}</dd>
            </div>
            <div>
              <dt>Segment</dt>
              <dd>{scenario.customer.segment}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>AED {scenario.amount}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{scenario.hour}:14 GST</dd>
            </div>
            <div>
              <dt>Frequent areas</dt>
              <dd>{scenario.customer.frequentAreas.join(" + ")}</dd>
            </div>
            <div>
              <dt>Customer history used</dt>
              <dd>{scenario.history.total} tx / 90 days</dd>
            </div>
          </dl>
          <div className="logicBox">
            <span>Correction logic</span>
            <p>
              The model compares the device&apos;s current registered location with
              transaction evidence, then estimates where the device is operating
              and which known shop it should be attached to.
            </p>
          </div>
        </aside>

        <section className="decisionPanel">
          <div className="decisionHeader">
            <div>
              <p className="eyebrow">Inferred device geolocation</p>
              <h2>
                {coord(selectedCandidate.actual.lat)}, {coord(selectedCandidate.actual.lng)}
              </h2>
              <span>
                Suggested shop: {selectedCandidate.branch} / Rank #{selectedRank}
              </span>
            </div>
            <div className={`confidence ${selectedCandidate.risk.toLowerCase()}`}>
              {selectedCandidate.confidence}%
            </div>
          </div>

          <div className="mapCard" aria-label="location map approximation">
            <div className="mapGrid" />
            <div className="mapAreaLabel topLeft">{currentDeviceArea}</div>
            <div className="mapAreaLabel bottomRight">{inferredDeviceArea}</div>
            <div className="mapRoute" />
            {scenario.candidates.map((candidate, index) => (
              <button
                aria-label={`Select ${candidate.branch}`}
                className={candidate.id === selectedCandidate.id ? "shopMarker activeShop" : "shopMarker"}
                key={candidate.id}
                onClick={() => setSelectedCandidateId(candidate.id)}
                style={mapPosition(candidate.actual)}
                type="button"
              >
                <span>{index + 1}</span>
                <b>{candidate.branch}</b>
              </button>
            ))}
            <div className="mapPoint registered" style={mapPosition(scenario.deviceRecord.onboarded)}>
              Registered
            </div>
            <div className="mapPoint home" style={mapPosition(scenario.customer.home)}>
              Home
            </div>
            <div className="mapPoint work" style={mapPosition(scenario.customer.work)}>
              Work
            </div>
            <div className="mapPoint winner" style={mapPosition(selectedCandidate.actual)}>
              Inferred POS
            </div>
            <div className="storeCallout" style={mapPosition(selectedCandidate.actual)}>
              <span>Suggested shop</span>
              <strong>{selectedCandidate.branch}</strong>
              <small>
                {selectedCandidate.brand} / {selectedCandidate.confidence}% confidence
              </small>
            </div>
            <div className="mapLegend">
              <span>
                Current label: {currentDeviceArea} / Inferred shop area: {inferredDeviceArea}
              </span>
              <strong>
                {kmText(correctionDistance)} correction distance
              </strong>
            </div>
          </div>

          <div className="evidenceGrid">
            {[
              ["Customer orbit", selectedCandidate.catchment],
              ["Area behavior", selectedCandidate.behavior],
              ["Repeat brand", selectedCandidate.repeat],
              ["Ticket fit", selectedCandidate.ticket],
              ["Time fit", selectedCandidate.timeFit],
              ["Device record fit", selectedCandidate.onboarding],
              ["History area", selectedCandidate.historyArea],
              ["History brand", selectedCandidate.historyBrand],
              ["History shop", selectedCandidate.historyShop],
            ].map(([label, value]) => (
              <div className="evidence" key={label as string}>
                <span>{label as string}</span>
                <div>
                  <i style={{ width: `${Math.round(Number(value) * 100)}%` }} />
                </div>
                <strong>{Math.round(Number(value) * 100)}%</strong>
              </div>
            ))}
          </div>

          <div className="formulaPanel">
            <div className="tableHeader">
              <div>
                <p className="eyebrow">Score drill-down</p>
                <h3>How this geolocation confidence is calculated</h3>
              </div>
              <strong>
                {pts(positiveScore)} - {pts(densityPenalty)} = {selectedCandidate.confidence}%
              </strong>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Raw detail</th>
                    <th>Signal value</th>
                    <th>Weight</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {scoringRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.raw}</td>
                      <td>{pct(row.value)}</td>
                      <td>{pct(row.weight)}</td>
                      <td>{pts(row.contribution)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Density penalty</td>
                    <td>
                      {selectedCandidate.tx30d.toLocaleString()} transactions in 30 days
                    </td>
                    <td>{selectedCandidate.tx30d > 6000 ? "Applied" : "None"}</td>
                    <td>-</td>
                    <td>-{pts(densityPenalty)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="candidatePanel">
          <div className="panelHeader">
            <span>Possible shop ties</span>
            <strong>{scenario.candidates.length} shops</strong>
          </div>
          <div className="candidateList">
            {scenario.candidates.map((candidate) => (
              <button
                className={candidate.id === selectedCandidate.id ? "selectedCandidate" : ""}
                key={candidate.id}
                onClick={() => setSelectedCandidateId(candidate.id)}
                type="button"
              >
                <div>
                  <span>{candidate.id}</span>
                  <strong>{candidate.branch}</strong>
                  <small>{candidate.reasons[0]}</small>
                </div>
                <b>{candidate.confidence}%</b>
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="drilldownSection">
        <div className="tableHeader">
          <div>
            <p className="eyebrow">All candidate numbers</p>
            <h2>Shop-by-shop geolocation comparison</h2>
          </div>
          <span>
            Device {scenario.deviceRecord.deviceId} currently labeled {currentDeviceArea}
          </span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Shop ID</th>
                <th>Shop</th>
                <th>Area</th>
                <th>Inferred lat/lng</th>
                <th>Correction km</th>
                <th>Risk</th>
                <th>Home km</th>
                <th>Work km</th>
                <th>Catchment</th>
                <th>Behavior</th>
                <th>Repeat</th>
                <th>Ticket</th>
                <th>Time</th>
                <th>Onboarding</th>
                <th>Hist area</th>
                <th>Hist brand</th>
                <th>Hist shop</th>
                <th>Hist proximity</th>
                <th>Tx 30d</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {scenario.candidates.map((candidate, index) => (
                <tr
                  className={candidate.id === selectedCandidate.id ? "activeRow" : ""}
                  key={candidate.id}
                  onClick={() => setSelectedCandidateId(candidate.id)}
                >
                  <td>#{index + 1}</td>
                  <td>{candidate.id}</td>
                  <td>{candidate.branch}</td>
                  <td>{candidate.area}</td>
                  <td>
                    {coord(candidate.actual.lat)}, {coord(candidate.actual.lng)}
                  </td>
                  <td>{kmText(km(scenario.deviceRecord.onboarded, candidate.actual))}</td>
                  <td>{candidate.risk}</td>
                  <td>{kmText(candidate.distanceHome)}</td>
                  <td>{kmText(candidate.distanceWork)}</td>
                  <td>{pct(candidate.catchment)}</td>
                  <td>{pct(candidate.behavior)}</td>
                  <td>{pct(candidate.repeat)}</td>
                  <td>{pct(candidate.ticket)}</td>
                  <td>{pct(candidate.timeFit)}</td>
                  <td>{pct(candidate.onboarding)}</td>
                  <td>{pct(candidate.historyArea)}</td>
                  <td>{pct(candidate.historyBrand)}</td>
                  <td>{pct(candidate.historyShop)}</td>
                  <td>{pct(candidate.historyProximity)}</td>
                  <td>{candidate.tx30d.toLocaleString()}</td>
                  <td>{candidate.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="drilldownSection detailGrid">
        <div>
          <p className="eyebrow">Correction record</p>
          <h2>{correctionNeeded ? "Shop assignment should be corrected" : "Device label looks close"}</h2>
        </div>
        <div className="tableWrap">
          <table>
            <tbody>
              <tr>
                <th>Device ID</th>
                <td>{scenario.deviceRecord.deviceId}</td>
                <th>Current device label</th>
                <td>{currentDeviceArea}</td>
              </tr>
              <tr>
                <th>Suggested shop ID</th>
                <td>{selectedCandidate.id}</td>
                <th>Suggested shop</th>
                <td>{selectedCandidate.branch}</td>
              </tr>
              <tr>
                <th>Brand</th>
                <td>{selectedCandidate.brand}</td>
                <th>Category</th>
                <td>{selectedCandidate.category}</td>
              </tr>
              <tr>
                <th>Inferred device lat/lng</th>
                <td>
                  {coord(selectedCandidate.actual.lat)}, {coord(selectedCandidate.actual.lng)}
                </td>
                <th>Current record lat/lng</th>
                <td>
                  {coord(scenario.deviceRecord.onboarded.lat)},{" "}
                  {coord(scenario.deviceRecord.onboarded.lng)}
                </td>
              </tr>
              <tr>
                <th>Correction distance</th>
                <td>{kmText(correctionDistance)}</td>
                <th>Correction status</th>
                <td>{correctionNeeded ? "Mismatch flagged" : "No major mismatch"}</td>
              </tr>
              <tr>
                <th>Avg ticket</th>
                <td>AED {selectedCandidate.avgTicket}</td>
                <th>Observed amount</th>
                <td>AED {scenario.amount}</td>
              </tr>
              <tr>
                <th>Customer 90d history</th>
                <td>{scenario.history.total} transactions</td>
                <th>History at suggested shop</th>
                <td>{scenario.history.merchantCounts[selectedCandidate.id] || 0}</td>
              </tr>
              <tr>
                <th>Customer home</th>
                <td>
                  {coord(scenario.customer.home.lat)}, {coord(scenario.customer.home.lng)}
                </td>
                <th>Customer work</th>
                <td>
                  {coord(scenario.customer.work.lat)}, {coord(scenario.customer.work.lng)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="drilldownSection">
        <div className="tableHeader">
          <div>
            <p className="eyebrow">Customer transaction history used</p>
            <h2>{scenario.customer.id} prior 90-day behavior</h2>
          </div>
          <span>
            {scenario.history.total} transactions / {Object.keys(scenario.history.areaCounts).length} areas /{" "}
            {Object.keys(scenario.history.brandCounts).length} brands
          </span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>History txn</th>
                <th>Days ago</th>
                <th>Brand</th>
                <th>Shop</th>
                <th>Area</th>
                <th>Amount</th>
                <th>Hour</th>
                <th>Shop lat/lng</th>
                <th>Km to selected shop</th>
              </tr>
            </thead>
            <tbody>
              {scenario.history.transactions.slice(0, 40).map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.id}</td>
                  <td>{tx.dayOffset}</td>
                  <td>{tx.brand}</td>
                  <td>{tx.shop}</td>
                  <td>{tx.area}</td>
                  <td>AED {tx.amount}</td>
                  <td>{tx.hour}:00</td>
                  <td>
                    {coord(tx.point.lat)}, {coord(tx.point.lng)}
                  </td>
                  <td>{kmText(km(tx.point, selectedCandidate.actual))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="modelSection">
        <div>
          <p className="eyebrow">Better than sending sales reps</p>
          <h2>Use transaction evidence as a privacy-aware POS locator.</h2>
        </div>
        <div className="modelSteps">
          <article>
            <b>1</b>
            <strong>Start from the device record</strong>
            <p>Read the current POS label, area, and onboarded coordinates from the device profile.</p>
          </article>
          <article>
            <b>2</b>
            <strong>Infer approximate lat/lng</strong>
            <p>Use anonymized customer orbit, timing, amount fit, and nearby shop candidates.</p>
          </article>
          <article>
            <b>3</b>
            <strong>Correct the shop tie</strong>
            <p>Attach the device to the most likely physical shop or queue close calls for review.</p>
          </article>
        </div>
      </section>
        </>
      )}

      {activeView === "transactions" && (
        <section className="drilldownSection">
          <div className="tableHeader">
            <div>
              <p className="eyebrow">Recent 90 days</p>
              <h2>Transactions with tagged geolocations</h2>
            </div>
            <span>
              {accurateTx} accurate / {reviewTx} review / {incorrectTx} incorrect
            </span>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Txn ID</th>
                  <th>Date</th>
                  <th>Device</th>
                  <th>Customer</th>
                  <th>Brand</th>
                  <th>Amount</th>
                  <th>Registered area</th>
                  <th>Tagged geolocation</th>
                  <th>Suggested shop</th>
                  <th>Correction km</th>
                  <th>Confidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => (
                  <tr
                    className={
                      tx.status === "Incorrect"
                        ? "flaggedRow"
                        : tx.status === "Review"
                          ? "reviewRow"
                          : ""
                    }
                    key={tx.id}
                  >
                    <td>{tx.id}</td>
                    <td>{tx.date}</td>
                    <td>{tx.deviceId}</td>
                    <td>{tx.customerId}</td>
                    <td>{tx.brand}</td>
                    <td>AED {tx.amount}</td>
                    <td>{tx.registeredArea}</td>
                    <td>{tx.inferredArea}</td>
                    <td>{tx.suggestedShop}</td>
                    <td>{kmText(tx.correctionKm)}</td>
                    <td>{tx.confidence}%</td>
                    <td>{tx.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "movement" && (
        <>
          <section className="dashboardGrid">
            <article>
              <span>Same store/location</span>
              <strong>{sameStoreDevices}</strong>
              <small>Registered and inferred location are within 1 km</small>
            </article>
            <article>
              <span>Same merchant, different store</span>
              <strong>{differentStoreDevices}</strong>
              <small>Same registration family, but likely operating elsewhere</small>
            </article>
            <article className="dangerCard">
              <span>Different merchant location</span>
              <strong>{differentMerchantLocationDevices}</strong>
              <small>Device appears far from the registered location/shop</small>
            </article>
          </section>
          <section className="drilldownSection">
            <div className="tableHeader">
              <div>
                <p className="eyebrow">Movement dashboard</p>
                <h2>Devices by registered vs inferred store</h2>
              </div>
              <span>Sample of 80 monitored POS devices</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Registered merchant</th>
                    <th>Registered area</th>
                    <th>Inferred store</th>
                    <th>Inferred area</th>
                    <th>Registered lat/lng</th>
                    <th>Inferred lat/lng</th>
                    <th>Drift km</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.map((device) => (
                    <tr
                      className={
                        device.movementStatus === "Different merchant location"
                          ? "flaggedRow"
                          : device.movementStatus === "Same merchant, different store"
                            ? "reviewRow"
                            : ""
                      }
                      key={device.id}
                    >
                      <td>{device.deviceId}</td>
                      <td>{device.brand}</td>
                      <td>{device.registeredArea}</td>
                      <td>{device.branch}</td>
                      <td>{device.area}</td>
                      <td>
                        {coord(device.onboarded.lat)}, {coord(device.onboarded.lng)}
                      </td>
                      <td>
                        {coord(device.actual.lat)}, {coord(device.actual.lng)}
                      </td>
                      <td>{kmText(device.driftKm)}</td>
                      <td>{device.movementStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeView === "charts" && (
        <>
          <section className="dashboardGrid">
            <article>
              <span>Largest monitored category</span>
              <strong>{categoryRows[0]?.label}</strong>
              <small>
                {categoryRows[0]?.count.toLocaleString()} devices, useful for sizing coverage
              </small>
            </article>
            <article>
              <span>Correction-risk devices</span>
              <strong>{highRiskDevices.toLocaleString()}</strong>
              <small>
                High risk, plus {mediumRiskDevices.toLocaleString()} medium-risk devices
              </small>
            </article>
            <article>
              <span>Review queue rate</span>
              <strong>{reviewQueueRate}%</strong>
              <small>
                {reviewQueue} of {recentTransactions.length} recent transactions need review
              </small>
            </article>
            <article>
              <span>Average correction distance</span>
              <strong>{kmText(avgCorrectionKm)}</strong>
              <small>Mean registered-to-inferred distance across recent transactions</small>
            </article>
          </section>

          <section className="chartGrid">
            <article className="chartPanel">
              <div className="tableHeader">
                <div>
                  <p className="eyebrow">Bar chart</p>
                  <h2>Devices by merchant category</h2>
                </div>
              </div>
              <div className="barChart">
                {categoryRows.map((row, index) => (
                  <div className="barRow" key={row.label}>
                    <span>{row.label}</span>
                    <div>
                      <i
                        style={{
                          width: `${(row.count / Math.max(1, categoryRows[0].count)) * 100}%`,
                          background: chartColor(index),
                        }}
                      />
                    </div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="chartPanel">
              <div className="tableHeader">
                <div>
                  <p className="eyebrow">Pie chart</p>
                  <h2>Category mix</h2>
                </div>
              </div>
              <div className="pieLayout">
                <div
                  aria-label="merchant category mix"
                  className="pieChart"
                  style={{ background: `conic-gradient(${pieGradient})` }}
                />
                <div className="legendList">
                  {topCategories.map((row, index) => (
                    <div key={row.label}>
                      <i style={{ background: chartColor(index) }} />
                      <span>{row.label}</span>
                      <strong>{Math.round((row.count / categoryTotal) * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="chartPanel">
              <div className="tableHeader">
                <div>
                  <p className="eyebrow">Status bars</p>
                  <h2>Recent transaction review workload</h2>
                </div>
              </div>
              <div className="barChart">
                {transactionStatusRows.map((row, index) => (
                  <div className="barRow" key={row.label}>
                    <span>{row.label}</span>
                    <div>
                      <i
                        style={{
                          width: `${(row.count / Math.max(1, recentTransactions.length)) * 100}%`,
                          background: chartColor(index),
                        }}
                      />
                    </div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}

      {activeView === "devices" && (
        <section className="drilldownSection">
          <div className="tableHeader">
            <div>
              <p className="eyebrow">POS device data</p>
              <h2>All monitored devices</h2>
            </div>
            <span>{merchants.length.toLocaleString()} synthetic device records</span>
          </div>
          <div className="tableWrap tallTable">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Merchant ID</th>
                  <th>Registered merchant</th>
                  <th>Category</th>
                  <th>Registered area</th>
                  <th>Current store</th>
                  <th>Current area</th>
                  <th>Registered lat/lng</th>
                  <th>Inferred lat/lng</th>
                  <th>Drift km</th>
                  <th>Risk</th>
                  <th>Tx 30d</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((device) => {
                  const driftKm = km(device.onboarded, device.actual);
                  return (
                    <tr className={driftKm >= 8 ? "flaggedRow" : driftKm >= 1 ? "reviewRow" : ""} key={device.id}>
                      <td>{device.deviceId}</td>
                      <td>{device.id}</td>
                      <td>{device.brand}</td>
                      <td>{device.category}</td>
                      <td>{areaNameFromPoint(device.onboarded)}</td>
                      <td>{device.branch}</td>
                      <td>{device.area}</td>
                      <td>
                        {coord(device.onboarded.lat)}, {coord(device.onboarded.lng)}
                      </td>
                      <td>
                        {coord(device.actual.lat)}, {coord(device.actual.lng)}
                      </td>
                      <td>{kmText(driftKm)}</td>
                      <td>{device.risk}</td>
                      <td>{device.tx30d.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "customers" && (
        <section className="drilldownSection">
          <div className="tableHeader">
            <div>
              <p className="eyebrow">Customer model data</p>
              <h2>All modeled customers</h2>
            </div>
            <span>{customers.length.toLocaleString()} synthetic customer records</span>
          </div>
          <div className="tableWrap tallTable">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Segment</th>
                  <th>Home lat/lng</th>
                  <th>Work lat/lng</th>
                  <th>Frequent areas</th>
                  <th>Loyalty brands</th>
                  <th>Tx 90d</th>
                  <th>Top history area</th>
                  <th>Top history brand</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer, index) => {
                  const history = buildCustomerHistory(customer, merchants, index);
                  const topArea =
                    Object.entries(history.areaCounts).sort((a, b) => b[1] - a[1])[0]?.join(": ") ||
                    "-";
                  const topBrand =
                    Object.entries(history.brandCounts).sort((a, b) => b[1] - a[1])[0]?.join(": ") ||
                    "-";

                  return (
                    <tr key={customer.id}>
                      <td>{customer.id}</td>
                      <td>{customer.segment}</td>
                      <td>
                        {coord(customer.home.lat)}, {coord(customer.home.lng)}
                      </td>
                      <td>
                        {coord(customer.work.lat)}, {coord(customer.work.lng)}
                      </td>
                      <td>{customer.frequentAreas.join(" + ")}</td>
                      <td>{customer.loyaltyBrands.join(" + ")}</td>
                      <td>{customer.tx90d}</td>
                      <td>{topArea}</td>
                      <td>{topBrand}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isModalOpen && (
        <div className="modalBackdrop" role="presentation">
          <section className="modalPanel" aria-modal="true" role="dialog">
            <div className="tableHeader">
              <div>
                <p className="eyebrow">Simulation inputs</p>
                <h2>Edit transaction and device key-value pairs</h2>
              </div>
              <button className="ghostButton" onClick={() => setIsModalOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="formGrid">
              <label>
                <span>seed</span>
                <input
                  onChange={(event) => updateDraft("seed", event.target.value)}
                  type="number"
                  value={draftConfig.seed}
                />
                <small>Controls the repeatable random scenario used by this demo.</small>
              </label>
              <label>
                <span>device_id</span>
                <select
                  onChange={(event) => setDraftDevice(Number(event.target.value))}
                  value={draftConfig.deviceIndex}
                >
                  {merchants.map((device, index) => (
                    <option key={device.deviceId} value={index}>
                      {device.deviceId} / {device.brand} / {areaNameFromPoint(device.onboarded)}
                    </option>
                  ))}
                </select>
                <small>The POS terminal being tested for a possible location correction.</small>
              </label>
              <label>
                <span>device_sample_index</span>
                <input
                  max={merchants.length - 1}
                  min={0}
                  onChange={(event) => setDraftDevice(Number(event.target.value))}
                  type="number"
                  value={draftConfig.deviceIndex}
                />
                <small>Internal sample row behind the selected POS device.</small>
              </label>
              <label>
                <span>current_registered_area</span>
                <select
                  onChange={(event) => {
                    const area = areas.find((item) => item.name === event.target.value) || areas[0];
                    setDraftConfig((current) => ({
                      ...current,
                      registeredArea: area.name,
                      registeredLat: area.lat,
                      registeredLng: area.lng,
                    }));
                  }}
                  value={draftConfig.registeredArea}
                >
                  {areas.map((area) => (
                    <option key={area.name} value={area.name}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <small>The area currently stored on the POS onboarding/device record.</small>
              </label>
              <label>
                <span>registered_lat</span>
                <input
                  onChange={(event) => updateDraft("registeredLat", event.target.value)}
                  step="0.00001"
                  type="number"
                  value={draftConfig.registeredLat}
                />
                <small>Latitude currently stored for the device before correction.</small>
              </label>
              <label>
                <span>registered_lng</span>
                <input
                  onChange={(event) => updateDraft("registeredLng", event.target.value)}
                  step="0.00001"
                  type="number"
                  value={draftConfig.registeredLng}
                />
                <small>Longitude currently stored for the device before correction.</small>
              </label>
              <label>
                <span>customer_sample_index</span>
                <input
                  max={customers.length - 1}
                  min={0}
                  onChange={(event) => updateDraft("customerIndex", event.target.value)}
                  type="number"
                  value={draftConfig.customerIndex}
                />
                <small>Customer profile whose transaction history is used as evidence.</small>
              </label>
              <label>
                <span>observed_brand</span>
                <select
                  onChange={(event) => updateDraft("brand", event.target.value)}
                  value={draftConfig.brand}
                >
                  {brandPool.map((brand) => (
                    <option key={brand[0]} value={brand[0]}>
                      {brand[0]}
                    </option>
                  ))}
                </select>
                <small>Merchant brand seen on the transaction authorization record.</small>
              </label>
              <label>
                <span>amount_aed</span>
                <input
                  min={1}
                  onChange={(event) => updateDraft("amount", event.target.value)}
                  type="number"
                  value={draftConfig.amount}
                />
                <small>Transaction amount used for ticket-size fit against shop history.</small>
              </label>
              <label>
                <span>transaction_hour_gst</span>
                <input
                  max={23}
                  min={0}
                  onChange={(event) => updateDraft("hour", event.target.value)}
                  type="number"
                  value={draftConfig.hour}
                />
                <small>Local transaction hour used to weight home/work behavior.</small>
              </label>
            </div>
            <div className="modalActions">
              <button
                className="ghostButton"
                onClick={() => setDraftConfig(buildScenarioConfig(draftConfig.seed + 1))}
                type="button"
              >
                Randomize values
              </button>
              <button className="primary" onClick={applySimulation} type="button">
                Apply simulation
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
