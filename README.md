# Municipal Slaughterhouse and Vendor Billing Dashboard

A full-stack web application for a Philippine LGU slaughterhouse office, designed to manage slaughter records, vendor billing, invoice generation, and fee computation.

## Stack
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express
- Data layer: in-memory mock API layer for local development
- Charts: Recharts
- PDF output: jsPDF

## Features
- Dashboard summary cards and charts
- Slaughter record management with filters and add flow
- Invoice creation and printable receipt modal
- Vendor management and search
- Notifications and unread tracking
- Service computation with editable fixed fees
- Default admin profile: Maria Christina Lopez, Municipal Treasurer

## Run locally
1. Install dependencies
   npm install
2. Start the app
   npm run dev
3. Open the app in your browser
   http://localhost:5173

The Express API runs on http://localhost:5000.

## Notes
- All fees are stored through the service API at runtime.
- This local build uses a seeded mock dataset and API layer suitable for demo and development. It is set up to be extended to PostgreSQL/Supabase in a production environment.
