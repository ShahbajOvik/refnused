/**
 * Built-in guide copy. Editors can replace the title, description and add
 * their own copy in Sanity (template "wipe" or "grading"); the steps below
 * stay as the core of the page.
 *
 * TODO (before launch): have the business check these steps against the
 * current iOS and Android versions. Menu names change between releases.
 * When you change this copy, update `updatedAt` in src/lib/guides/compose.ts.
 */

export type GuideSteps = { id: string; title: string; intro?: string; steps: string[] };

export const wipeGuide = {
  intro:
    "Wiping your phone protects your photos, messages and accounts, and a phone that’s still signed in to iCloud or Google is locked to you, so nobody can buy or use it. It takes about 15 minutes.",
  sections: [
    {
      id: "before-you-start",
      title: "Before you start",
      steps: [
        "Back up your photos, messages, contacts and app data to iCloud, Google or a computer.",
        "If you use two-factor authentication through text messages or an authenticator app, move it to your new phone first.",
        "Unpair any smartwatch or earbuds linked to the phone.",
        "Charge the phone to at least 50%, or keep it plugged in while it resets.",
      ],
    },
    {
      id: "iphone",
      title: "iPhone",
      steps: [
        "Open Settings, tap your name, then Find My, then Find My iPhone, and turn it off. Enter your Apple ID password when asked.",
        "Go back to Settings, tap your name, scroll down and tap Sign Out.",
        "Open Settings, then General, then Transfer or Reset iPhone, and tap Erase All Content and Settings.",
        "Wait for the phone to restart on the Hello screen. Don’t set it up again.",
      ],
    },
    {
      id: "samsung",
      title: "Samsung Galaxy",
      steps: [
        "Open Settings, then Accounts and backup, then Manage accounts. Remove your Google account and your Samsung account.",
        "Open Settings, then General management, then Reset, and tap Factory data reset.",
        "Tap Reset and confirm. The phone restarts on the welcome screen.",
      ],
    },
    {
      id: "pixel",
      title: "Google Pixel and other Android phones",
      steps: [
        "Open Settings, then Passwords and accounts (or Accounts), and remove your Google account.",
        "Open Settings, then System, then Reset options, and tap Erase all data (factory reset).",
        "Confirm with your PIN. The phone restarts on the welcome screen.",
      ],
    },
    {
      id: "finally",
      title: "Finally",
      steps: [
        "Take out your SIM card and any memory card.",
        "Remove the phone from your account’s device list at appleid.apple.com or myaccount.google.com.",
        "Remove any case or screen protector you want to keep.",
      ],
    },
  ] satisfies GuideSteps[],
  note: "Menu names can vary a little between software versions and phone makers.",
  ourPart:
    "We check every phone we buy is signed out, and we securely wipe it again before it’s resold. Every refurbished phone we sell comes with a data-wipe certificate.",
} as const;

export const gradingGuide = {
  intro:
    "Every refurbished phone we sell is fully tested and works like new. The grade only describes how it looks: how many marks there are on the screen and body.",
  everyGrade: [
    "Fully tested by our team before it’s listed",
    "Checked against the CheckMEND database: never lost, stolen or on finance",
    "Securely data-wiped, with a certificate",
    "Battery health measured and shown on every listing",
    "Covered by our warranty",
  ],
  batteryIntro:
    "Battery health is how much charge the battery holds compared with when it was new. We measure it for every phone and show it on the listing, so you know exactly what you’re getting.",
  tradeInIntro:
    "When you sell us a phone, you choose the condition that matches it best. If it’s different when we check it, we’ll send you a revised offer before going ahead.",
} as const;
