# Payment International POS Geolocation Intelligence

Payment International POS Geolocation Intelligence is a demo analytics app for identifying when a POS device is operating somewhere other than its registered/onboarded location.

The app starts with a device record, transaction event, customer behavior history, and a set of possible shop locations. It then estimates the most likely physical shop/geolocation for the POS device and highlights whether the device should stay attached to its current registered location or be reviewed for correction.

## What The App Does

- Simulates monitored POS devices across Dubai-like trade areas such as JLT, Silicon Oasis, Downtown, Deira, Dubai Marina, and Business Bay.
- Uses synthetic customer transaction history to infer where a device is likely operating.
- Scores possible shop ties using customer orbit, prior transaction areas, brand history, ticket amount fit, time-of-day behavior, and device-record distance.
- Shows a dynamic map with registered POS location, inferred POS/shop location, customer home/work, and candidate shops.
- Provides drill-down tables explaining every scoring signal and contribution.
- Flags recent transactions and devices that appear inaccurate versus onboarding data.
- Includes dashboards for device movement, correction-risk devices, category mix, review workload, and raw device/customer tables.

## Key Screens

- **Live correction**: Simulate a POS transaction, inspect the inferred geolocation, and compare candidate shops.
- **90-day transactions**: Review tagged geolocations and flagged transactions.
- **Device movement**: Separate devices that are still at the same store from devices that appear to have moved to a different store or merchant location.
- **Category charts**: View bar and pie charts for merchant categories, review workload, and correction risk.
- **Devices data**: Inspect the monitored POS device dataset.
- **Customers data**: Inspect modeled customers and their transaction-history-derived behavior.

## Simulation Inputs

Click **Simulate new transaction** in the app to open an editable modal. You can adjust:

- POS device ID
- registered/onboarded area
- registered latitude and longitude
- customer sample
- observed merchant brand
- transaction amount
- transaction hour
- random seed

Changing these values recalculates the candidate shops, inferred lat/lng, confidence score, and map markers.

## How The Scoring Works

Each candidate shop receives a confidence score based on weighted signals:

- customer home/work orbit distance
- customer frequent-area behavior
- repeat brand behavior
- current transaction ticket amount fit
- time-of-day fit
- current device record fit
- customer history area visits
- customer history brand visits
- same-shop repeats
- proximity to historical customer transactions
- customer historical ticket fit
- high-density merchant penalty

The current implementation uses deterministic synthetic data generated in `app/page.tsx`. It does not connect to production transaction systems, GPS hardware, card-network data, or a real merchant master yet.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Vinext / Vite
- Cloudflare Worker-compatible build output

## Prerequisites

- Node.js `>=22.13.0`
- npm

## Local Installation

Clone the repository:

```bash
git clone https://github.com/AppSpoke-Go/PaymentInternational.git
cd PaymentInternational
```

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Open the local URL printed by the dev server, usually:

```text
http://localhost:3000/
```

If port `3000` is already in use, Vinext will choose another port such as `3001`.

## Validation Commands

Run lint:

```bash
npm run lint
```

Run a production build:

```bash
npm run build
```

Run the test script:

```bash
npm test
```

## Useful Project Files

- `app/page.tsx`: main app, simulation data, scoring logic, views, tables, and charts
- `app/globals.css`: UI styling, map, dashboards, tables, modal, and charts
- `app/layout.tsx`: app shell and metadata
- `package.json`: scripts and dependencies
- `.openai/hosting.json`: Sites hosting configuration

## Notes

This is currently a front-end analytics prototype with synthetic data. To connect it to real operations data, replace the generated datasets with production feeds such as:

- terminal onboarding records
- merchant master/shop geocodes
- customer transaction history
- transaction authorization events
- device movement or exception queues
