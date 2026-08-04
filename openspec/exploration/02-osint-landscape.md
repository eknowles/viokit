# 02 — OSINT Landscape & Domain Catalog

> **Status:** Parking notes. Source: Bellingcat Online Investigation Toolkit (336 tools across 24
> sub-categories, CSV release), Bellingcat challenge taxonomy (Audio, Chronolocation, Geolocation,
> Historic Research, Image Verification, Internet Research, Munition Analysis, Satellite Imagery,
> Transport), plus obvious extensions ("and more").
>
> Raw catalog: https://github.com/bellingcat/toolkit/releases/tag/csv (`all-tools.csv`).

---

## 0. The headline

**The domain is not closed. It is open by nature** — 24 sub-categories already, and "and more".
This is not a problem; it is the single most important input to the architecture:

- If we try to enumerate a *closed* entity/relation catalog, we will be wrong within a week.
- What is actually **stable across every OSINT domain** is a small set:
  1. **Core primitives** — Entity (typed, with identity), typed Identifier, temporal extent,
     spatial extent, Relation, Event, Evidence, Step. These appear in *every* domain.
  2. **Transform archetypes** — a handful of *shapes* that almost every OSINT practice maps to.
  3. **Source spec contract** — uniform transport/auth/policy/parsing.
- What **varies per domain** is the catalog: entity types, relation types, concrete sources,
  domain logic. All of it must be **contributed as modules**, not baked into core.

Consequence for Viokit: core = primitives + archetypes + execution + evidence. Domains = pluggable
"packs" (types + sources + transforms). Agents and users add packs over time; nothing breaks.

---

## 1. Transform archetypes (the stable shapes)

Every OSINT practice maps to one of these. The core implements the *archetype*; a domain pack
supplies the *logic* (how to query, how to parse, how to project to entities/relations).

| # | Archetype | Input → Output | Canonical example |
|---|---|---|---|
| 1 | **lookup** | typed identifier → record | CRN → company filing; IMO → vessel; email → breach |
| 2 | **search** | partial name / keyword → candidate set | username search (Sherlock), people search, keyword search |
| 3 | **resolve** | media → matching objects | reverse image search, facial recognition, audio fingerprint |
| 4 | **geolocate** | photo/video/text → coordinate → place | the Bellingcat bread-and-butter |
| 5 | **chronolocate** | media → datetime | sun/shadow (SunCalc, ShadowFinder), EXIF, content clues |
| 6 | **correlate** | candidates → deduped real-world identity | same person/company/entity across sources |
| 7 | **monitor / track** | moving object → position history | ADS-B flights, AIS ships, GPS traces, change detection |
| 8 | **extract** | document/webpage/response → structured fields | EXIF, DNS records, HTML, filing text, page metadata |
| 9 | **archive** | URL → immutable snapshot (evidence) | Wayback, archive.today, Auto Archiver |
| 10 | **analyze** | domain-specific analysis | munitions ID, species ID, spectral/change analysis, network analysis |

These are the seams: an AI agent asks *"which archetype is this?"* and the pack slots in.

---

## 2. Domain modules (draft catalog)

> Entity/relation lists are **illustrative, not exhaustive** — that is the point. Each pack extends the
> shared registry; types marked `core` are shared across packs.

### 2.1 Corporate & Finance
- **Entities:** Company, CompanyFiling, Officer/Appointment, OwnershipStake, BeneficialOwner, Address, TradeRecord, SanctionsEntry, LobbyingActivity, PoliticalContribution, OffshoreEntity
- **Relations:** `appointed_as`, `beneficial_owner`, `parent_of`, `registered_at`, `filed`, `sanctioned_by`, `trades_with`, `counterparty`
- **Sources:** Companies House, EDGAR, OpenCorporates, EU consolidated registers, OpenSanctions, SanctionsExplorer, EU Sanctions Map, ICIJ Offshore Leaks, Open Ownership, LittleSis, OpenSecrets, ImportYeti/ImportGenius, UN Comtrade
- **Archetypes:** lookup, search, correlate, extract

### 2.2 People & Identity
- **Entities:** Person, PersonName, Alias, PhoneNumber, EmailAddress, Username, Address, PublicRecord, CourtCase, Credential, BreachRecord
- **Relations:** `uses_phone`, `uses_email`, `uses_username`, `has_alias`, `lives_at`, `appears_in`, `convicted_in`
- **Sources:** Pipl, Spokeo, 192.com, Truecaller, GetContact, Maigret, Sherlock, WhatsMyName, Blackbird, Holehe, Epieos, HaveIBeenPwned, Intelx, DeHashed, Leak-Lookup, court-record DBs, white/yellow pages
- **Archetypes:** lookup, search, correlate

### 2.3 Social platforms (sub-modules per platform)
- **Entities:** SocialProfile, Post, Story, Media, Hashtag, Group/Channel, Comment, GeolocatedPost
- **Relations:** `posted`, `replied_to`, `member_of`, `followed_by`, `tagged`, `geolocated_at`
- **Sources (per platform):** Telegram — Telemetry, Telepathy, TelegramDB, TGStat, Telegago, tlgrm.eu; X/Twitter — advanced search, location search, video downloader; TikTok — date extract, hashtag analysis, ad library; Facebook — Meta Content Library, "who posted what"; Discord — leaks, chat exporter; VK — Photo-Map, VK.watch; Reddit — RedditMetis, F5Bot; gaming — NameMC, SteamId.uk, PSNprofiles, XboxGamertag; multi — Social Searcher, 4CAT, Zeeschuimer
- **Archetypes:** search, monitor, archive, geolocate, correlate
- **Note:** almost entirely **browser-session-first** → strong input for the session/identity transport.

### 2.4 Web & DNS
- **Entities:** Domain, WhoisRecord, DNSRecord, IPAddress, ASN, Certificate, WebPage, WebArtifact, TechFingerprint, Backlink
- **Relations:** `resolves_to`, `registered_by`, `hosted_on`, `cert_for`, `linked_from`, `served_by`
- **Sources:** DomainTools, Whoxy, ICANN Lookup, RDAP/WHOIS, DNS History, crt.sh, Shodan, urlscan.io, PublicWWW, grep.app, WhatCMS, Moz Link Explorer, IDN Checker, Information Laundromat
- **Archetypes:** lookup, extract, monitor, correlate

### 2.5 Geospatial & Maps
- **Entities:** Place, PointOfInterest, Address, Coordinate, Region, Trail, StreetView, ShadowModel
- **Relations:** `located_at`, `near`, `part_of`, `depicts`
- **Sources:** OpenStreetMap, Overpass Turbo, Bellingcat OSM Search, Spot, GeoNames, Google Maps, Mapillary, KartaView, PeakVisor, SunCalc, ShadeMap, ShadowFinder, what3words, topo/historic maps
- **Archetypes:** geolocate, search, analyze

### 2.6 Imagery — satellite & aerial
- **Entities:** SatelliteScene, Sensor, Satellite, CoverageArea, ChangeEvent, DeforestationEvent
- **Relations:** `captured_at`, `depicts`, `compared_to`
- **Sources:** Copernicus/Sentinel, NASA Worldview, Google Earth Engine, Google Earth Pro, Planet, Umbra (SAR), SkyFi, NASA FIRMS, RAMMB SLIDER, OrbTrack, OpenAerialMap, Radar Interference Tracker
- **Archetypes:** geolocate, analyze, monitor

### 2.7 Media forensics — image / video / audio
- **Entities:** Image, Video, AudioClip, MediaMetadata, FaceEmbedding, ForensicReport
- **Relations:** `has_metadata`, `depicts`, `matched_to`, `similar_to`, `appears_in`
- **Sources:** InVID, FotoForensics, Forensically, metadata2go, ExifPurge, PimEyes, FaceCheck.ID, Search4Faces, Amazon Rekognition, Azure Video Indexer, YouTube Metadata, MW Geofind, BirdNet (audio ID), RadiTube (subtitle search)
- **Archetypes:** resolve, extract, geolocate, chronolocate, analyze

### 2.8 Transport — air / maritime / rail / road
- **Entities:** Aircraft, Flight, Airport, Vessel, ShipTrack, Port, Vehicle, LicensePlate, RailLine, Train, Station
- **Relations:** `flew`, `docked_at`, `registered_to`, `tracked_at`, `located_at`
- **Sources:** Flightradar24, FlightAware, ADS-B Exchange, OpenSky, Airframes, FAA registry, MarineTraffic, VesselFinder, Global Fishing Watch, IMO Registry, Equasis, ShipFinder, OpenRailwayMap, Chronotrains, GPSJam, Live ATC, license-plate maps
- **Archetypes:** lookup, search, monitor, geolocate

### 2.9 Environment & Wildlife
- **Entities:** Species, ProtectedArea, DeforestationEvent, Wildfire, WaterRisk, FisheryActivity, WildlifeTradeCase, WeatherEvent
- **Relations:** `habitat_of`, `affected_by`, `traded`, `occurs_at`
- **Sources:** Global Forest Watch, Global Fishing Watch, Species+, CITES Trade DB, Movebank, BirdNet, Aqueduct, Nullschool, UNOSAT, WildEye, World DB of Protected Areas, Environmental Justice Atlas
- **Archetypes:** lookup, analyze, monitor

### 2.10 Conflict & Security
- **Entities:** Incident, Battle, Munition, MunitionComponent, ConflictParty, DisplacedPerson, SanctionsEntry, LawEnforcementRecord
- **Relations:** `occurred_at`, `involved`, `used_weapon`, `sanctioned_by`
- **Sources:** ACLED, LiveUAMap, Open Source Munitions Portal, Bulletpicker, CAT UXO, SanctionsExplorer, Police Records Access Project
- **Archetypes:** analyze, geolocate, lookup, monitor

### 2.11 Data breaches & leaks
- **Entities:** Breach, Leak, Credential, ExposedRecord, Victim, Dataset
- **Relations:** `contains`, `exposes`, `belongs_to`, `found_in`
- **Sources:** HaveIBeenPwned, Intelx, DeHashed, Leak-Lookup, 4CAT, TelegramDB, ICIJ leak databases, breach compilations (COMB, ALIEN TXTBASE, ...)
- **Archetypes:** lookup, search, correlate
- **Leaked-data taxonomy** (dataset source; each category can ship as a dataset pack):

  | Category | What leaks | Representative examples |
  |---|---|---|
  | **Credentials & accounts** | email/password/username combos, password hashes | COMB, ALIEN TXTBASE, collection #1 |
  | **Identity & PII** | national IDs, driver's licenses, phone-number databases, voter rolls, census | phone/SIM databases (global), voter rolls, DMV records |
  | **Travel & border** | see module 2.17 | PNR/passenger records, border-crossing DBs, hotel reservations |
  | **Financial** | card data, bank/account records, fintech lending, KYC | card dumps, fintech lending apps, KYC registries |
  | **Crypto** | exchange KYC, wallet-linked identity | exchange breaches, KYC leaks |
  | **Government & military** | personnel records, police records, customs | military personnel DBs, law-enforcement records |
  | **Healthcare** | patient records, prescriptions | hospital/insurer breaches |
  | **Corporate** | employee lists, payroll, HR, customers, source code | employer/enterprise breaches |
  | **Communications** | email dumps, chat logs, SMS, call records | email dumps, Discord/Telegram leak archives, CDR-style data |
  | **Social & media** | scraped platform user data | platform scrapes, aggregated profile data |
  | **Dating / health apps** | membership + PII | dating site breaches, fitness apps |
  | **Gaming** | accounts + PII | gaming platform breaches |
  | **Vehicle & property** | VIN/owner records, title/land registries | vehicle databases, property titles |

#### 2.11.1 Credentials as a modeled category
- **Entities:** Credential, PasswordHash, PlaintextPassword, AccountCompromise, ServiceAccount, Breach
- **Relations:** `credential_for` (Credential → ServiceAccount), `compromised_in` (→ Breach), `uses_password` (Person → PasswordHash), `reuses_password` (PasswordHash → PasswordHash), `exposes` (Breach → Credential)
- **Sources:** HaveIBeenPwned, DeHashed, Leak-Lookup, Intelx, leak-search portals, breach compilations
- **Archetypes:** lookup, search, correlate, extract
- **Derived investigation capabilities** (legitimate, non-intrusive):
  - **Breach exposure** — is an email/username/phone in a known breach, and which services?
  - **Account linking** — same email/username across services → profile graph.
  - **Password-reuse correlation** — a reused credential links accounts a person controls (identity/account-linking evidence).
  - **Compromise timeline** — when a credential entered a leak; used to assess account-takeover exposure in incident work.
- **Guardrails (non-negotiable):**
  - Plaintext passwords are *high-grade sensitive material*. Store hashes by default; treat plaintext as a
    need-to-view secret behind access control + full audit logging; never export plaintext in reports.
  - The system's purpose is *investigation and evidence*, not authentication. It MUST NOT automate
    authentication/credential use against live systems (unauthorized access). Password-reuse analysis
    stops at correlation/linking evidence; it never performs logins or account-takeover.
  - Redact on ingest by default (see `governance`); hashes are the safe correlatable form.

- **Veracity is the differentiator** — leaked data is *unverified*. Every leak-derived claim must carry
  provenance: how acquired, who supplied, when, authenticity assessment, and whether cross-verified
  against an independent source. Unverified claims must be flaggable and clearly marked in exports.

### 2.12 Archiving & web history
- **Entities:** Snapshot, ArchiveURL, ChangeEvent
- **Relations:** `captured_at`, `supersedes`, `archives`
- **Sources:** Wayback Machine, archive.today, Distill.io, Auto Archiver, Hunchly, Web Archives
- **Archetypes:** archive, monitor

### 2.13 Crypto & finance (extension)
- **Entities:** Wallet, Transaction, Token, Exchange, Collection
- **Relations:** `sent_to`, `received_from`, `controlled_by`
- **Sources:** Etherscan, BlockExplorer, chain explorers, mixer research
- **Archetypes:** lookup, correlate, analyze

### 2.14 Infrastructure & devices (extension)
- **Entities:** Device, Service, Certificate, Domain
- **Relations:** `exposes`, `listens_on`, `cert_for`
- **Sources:** Shodan, Censys, crt.sh, urlscan
- **Archetypes:** lookup, extract, monitor

### 2.15 Historic research (challenge category)
- **Entities:** Document, Artifact, Map, Archive, ProvenanceRecord
- **Relations:** `produced_in`, `depicts`, `provenance_of`
- **Sources:** digitised archives, historic maps (Topotijdreis), provenance databases
- **Archetypes:** search, analyze, correlate

### 2.16 Communications & chat (cross-platform)
- **Entities:** Message, Channel, Group, Participant
- **Relations:** `communicates_with`, `sent`, `member_of`
- **Sources:** Telegram/Discord tooling, chat exporters, leaked-chat datasets, email dumps
- **Archetypes:** search, monitor, archive, extract

### 2.17 Travel, border & migration
- **Entities:** Passport, Visa, NationalId, DrivingLicense, BorderCrossing, PortOfEntry, PassengerNameRecord (PNR), FlightBooking, HotelStay, Reservation, FrequentFlyerAccount, CustomsDeclaration, PassengerManifest
- **Relations:** `carries` (Person → Passport), `crossed_border` (Person → BorderCrossing → Port), `booked` (Person → PNR/Flight), `stayed_at` (Person → Hotel), `issued_by` (Document → Country/Authority), `listed_in` (Person → Manifest), `accrued` (Person → FrequentFlyerAccount)
- **Sources:**
  - **Primary:** ICAO 9303 MRZ standards, airline PNR systems, IATA, airport departures boards
  - **Leaked datasets:** border-crossing records, passenger manifests, PNR/booking data (e.g., airline reservation system breaches), hotel guest lists, visa-application databases, frequent-flyer account leaks, cruise passenger lists, customs/immigration dumps
  - **OSINT:** flight status/history APIs, flight trackers (2.8), travel forums, public incident manifests (e.g., MH370 passenger list)
- **Archetypes:** lookup, search, correlate, extract
- **Why it matters:** travel documents and crossing records are *identity+movement* evidence — a passport
  number is a high-value typed identifier that links a person across border records, bookings, hotel
  stays, and loyalty programs, and anchors **temporal evidence** (where someone was on a given date).
  This is a flagship pack for the 4D model (movement = spatiotemporal relations).

---

## 3. Identifier catalog (cross-cutting)

Typed identifiers are the connective tissue of the whole system — a `PhoneNumber` in a people pack
must match a `PhoneNumber` in a Telegram pack. Draft list:

- **People:** phone (E.164), email, username/handle, person-name, passport/national-id
- **Credentials:** email, username, password hash (e.g., MD5/SHA-1/ntlm), plaintext hash-of-hash, breach/record ID
- **Travel & identity docs:** passport number, MRZ/travel-document number, visa number, PNR locator, boarding-pass barcode, frequent-flyer number, national ID, driver's licence, taxpayer ID
- **Corporate:** CRN, VAT, UTR, EIN, LEI, registration number, CAGE, ICIJ ID
- **Transport:** IMO, MMSI, ICAO24 hex, aircraft N-number, IATA/ICAO codes, callsign, VIN, plate
- **Web/Infra:** domain, IP, ASN, TLS cert fingerprint, hostname, URL, netblock
- **Geo:** coordinate, geohash, what3words, grid reference, place ID
- **Media:** image/video SHA-256, EXIF hash, face embedding vector, audio fingerprint
- **Crypto:** wallet address, transaction hash, token contract
- **Documents:** ISBN, filing number, docket number

---

## 4. Implications for Viokit

1. **Open ontology registry** — entity/relation/identifier types are *registered at runtime* by domain
   packs. Core ships only the primitives (`Entity`, `Event`, `Relation`, `Evidence`, `Step`) and a
   starter set of shared types (Person, Company, Place, Domain, Email, Phone, Profile, Identifier).
2. **A "domain pack" is a unit of delivery**: entity types + relation types + sources + transforms +
   archetype mappings. Adding a new domain = adding a pack, not touching core.
3. **Archetypes are the agent-facing abstraction** — an agent describes a new practice by archetype +
   source + type mapping; the scaffold generates most of the pack.
4. **Browser-session-first is a requirement, not a nicety** — a huge fraction of sources
   (social, maps, search) are browser-first and fragile to scraping. This confirms the
   session/identity abstraction decision (fork #5).
5. **Dataset sources are a first-class transport** — leaks, exports, and registers arrive as files
   (CSV/JSON/SQLite). Each needs: a schema-mapping spec (columns → normalized records), a hash of the
   raw file, and a projection transform into ontology types. File ingest, not just HTTP/browser.
6. **Veracity & provenance are data, not vibes** — leaked data is unverified. Evidence and entities
   carry a veracity/confidence field plus acquisition provenance (how/when/from whom), and the
   `correlate` archetype is what upgrades a claim to corroborated (same identifier in an independent
   source). Exports must distinguish *verified* from *unverified*.
7. **PII & governance are a real capability** — handling passport numbers, voter rolls, healthcare
   leaks implies redaction, access control, retention, and legal/ethical guardrails. Add a
   `governance` concern (or fold into `investigations`) before the first leak pack ships.
8. **Evidence invariants are unchanged** — I1–I8 are about provenance/execution, not the catalog.
   They hold regardless of how many domains exist.
9. **First-pack recommendation** — start with the packs that match the original goal:
   `corporate-finance`, `people-identity`, `web-dns`, plus `travel-border` (flagship for the 4D
   model) and `social` (Telegram/Bluesky/X) later.

---

## 5. Where this lives next

This catalog becomes the seed for:
- `ontology` capability — the open type registry + how packs register types.
- `sources` capability — the source-spec contract and generic drivers per archetype.
- `agent-integration` capability — the catalog is what agents are given to plan and scaffold.
- The taxonomy itself can be vendored (toolkit CSV → machine-readable source index) so the
  landscape stays live and queryable rather than a static doc.
