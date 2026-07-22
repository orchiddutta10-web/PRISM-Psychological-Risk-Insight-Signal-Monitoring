# PRISM Guardian Web Dashboard

This directory contains the Next.js web application for guardians. It is designed to display wellness baselines and explainable behavioral alerts.

## Tech Stack
- Next.js (App Router)
- Tailwind CSS
- Tailwind config matching [design-system.md](../../docs/design-system.md) (Deep Indigo, Navy, Sage, Warm Amber, Saturated Red)
- Recharts / SVG visualization tools using Geometric Sans fonts

## Security Features
- JSON Web Token (JWT) auth stored in HTTP-Only cookies.
- Role-Based Access Control (RBAC) layers guarding specific sub-routes.
