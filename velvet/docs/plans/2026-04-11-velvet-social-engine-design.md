# Design Doc: Velvet Social Engine (Zbiornik Integration)

**Date:** 2026-04-11  
**Status:** Approved  
**Topic:** Replicating high-engagement social loops (Feed, Shoutbox, Profile) within the Velvet privacy ecosystem.

## Goal
Transform the Velvet MVP into a feature-equivalent competitor to established social platforms by implementing a real-time Shoutbox, a rich Activity Feed, and a dual-identity Profile system, while maintaining credit-based privacy.

## Core Features

### 1. Tablica Ogłoszeń (Real-time Shoutbox)
*   **Persistent Interface:** Right-hand sidebar on desktop; bottom-drawer on mobile.
*   **Real-time Logic:** Broadcast via Socket.io `shout:new` events.
*   **Hybrid Filtering:** Global feed by default, with persistent user-defined local filters (City/Region).
*   **Metadata Representation:** Nickname, Age/Gender/City, VIP/Verified badges.

### 2. Aktualności (The Hybrid Feed)
*   **Social Teasers:** Text updates and thought-shares are clear (unblurred) to all users.
*   **Engagement Loops:** Like, Love, and Comment support on all posts.
*   **Privacy-First Media:** Photos and Videos are blurred by default, requiring a "Match" or "50-credit Unlock" to unmask.

### 3. Profile & Dual Identity (The "Para" Model)
*   **Data Model:** 
    *   `Profile` schema updated to support dual-stats (Partner 1 + Partner 2).
    *   Account Type (Mężczyzna, Kobieta, Para, Trans) is permanent after registration.
*   **Layout:** Cover Banner (horizontal) with Avatar overlay.
*   **Tabbed Interface:** Wall, About (Interests/Limits), Photos, Videos, Friends.
*   **Consent Mode:** Permission-based unmasking for couples.

### 4. Registration "Frictionless" Entry
*   **Step 1:** Alphanumeric Nick + Account Type + Trust section showcase.
*   **Step 2:** Defer Email/Password collection to increase conversion.

## Implementation Roadmap
*   **Phase 1:** Layout Engine (Shoutbox & Sidebar).
*   **Phase 2:** Feed Architecture (Post composer, Metadata, Reactions).
*   **Phase 3:** Profile Overhaul (Banner/Avatar layout, Dual-stats component).
*   **Phase 4:** Registration Refinement (Step 1/2 split).
