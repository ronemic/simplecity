import {
  Bike,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  GraduationCap,
  Home,
  ShieldCheck,
  Trees
} from "lucide-react";

export const CATEGORIES = [
  "Housing",
  "Transportation",
  "Public Safety",
  "Parks & Environment",
  "Budget & Taxes",
  "Business & Development",
  "Schools & Youth",
  "City Services"
] as const;

export type CategoryName = (typeof CATEGORIES)[number];

export const CATEGORY_DEFINITIONS: Record<
  CategoryName,
  {
    slug: string;
    description: string;
    tone: string;
    icon: typeof Home;
  }
> = {
  Housing: {
    slug: "housing",
    description: "Rent, affordable homes, zoning, and decisions that shape where people can live.",
    tone: "bg-white text-[#734136] border-black/15",
    icon: Home
  },
  Transportation: {
    slug: "transportation",
    description: "Roads, bike lanes, parking, transit, traffic safety, and how people move around town.",
    tone: "bg-white text-[#2b5d97] border-black/15",
    icon: Bike
  },
  "Public Safety": {
    slug: "public-safety",
    description: "Police, fire, emergency response, disaster planning, and neighborhood safety.",
    tone: "bg-white text-[#765c24] border-black/15",
    icon: ShieldCheck
  },
  "Parks & Environment": {
    slug: "parks-environment",
    description: "Parks, waterfronts, climate work, trees, open space, and environmental protections.",
    tone: "bg-white text-[#42652a] border-black/15",
    icon: Trees
  },
  "Budget & Taxes": {
    slug: "budget-taxes",
    description: "City spending, fees, taxes, bonds, contracts, and the tradeoffs behind public money.",
    tone: "bg-white text-[#725722] border-black/15",
    icon: CircleDollarSign
  },
  "Business & Development": {
    slug: "business-development",
    description: "New buildings, local businesses, economic development, permits, and major projects.",
    tone: "bg-white text-[#2a665d] border-black/15",
    icon: BriefcaseBusiness
  },
  "Schools & Youth": {
    slug: "schools-youth",
    description: "Youth programs, school partnerships, students, childcare, and family-facing services.",
    tone: "bg-white text-[#5c4a78] border-black/15",
    icon: GraduationCap
  },
  "City Services": {
    slug: "city-services",
    description: "Utilities, public works, permits, libraries, maintenance, and everyday city operations.",
    tone: "bg-white text-[#365d6a] border-black/15",
    icon: Building2
  }
};

export const STATUS_TONES: Record<string, string> = {
  "Upcoming vote": "border-civic/25 bg-[#eef5ff] text-[#164a91]",
  "Under discussion": "border-[#e7ba6a] bg-[#fff7e8] text-[#7a4808]",
  Passed: "border-[#9fc6b2] bg-[#effbf3] text-[#24613c]",
  Tabled: "border-[#f0c75e] bg-[#fff9e9] text-[#73561a]",
  Cancelled: "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]",
  "Information only": "border-[#bed0dc] bg-[#eef3f6] text-[#12365f]",
  Upcoming: "border-civic/25 bg-[#eef5ff] text-[#164a91]",
  Past: "border-black/15 bg-[#f4f5f6] text-black/65"
};
