export type GuideComponent = {
  label: string
  icon: string
  description: string
}

export type GuideSubsection = {
  id: string
  title: string
  summary: string
  bullets: string[]
  note?: string
  components?: GuideComponent[]
}

export type GuideSection = {
  id: string
  number: string
  title: string
  icon: string
  overview: string
  highlights: string[]
  subsections: GuideSubsection[]
}

export const productGuideSections: GuideSection[] = [
  {
    id: 'dashboard',
    number: '01',
    title: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    overview: 'The Dashboard is the portal\'s command center. It combines top-line signed retainers, active state coverage, invoice momentum, and recent work so firms can understand performance before opening deeper workflow pages.',
    highlights: ['4 KPI cards', '6-month invoice trend', 'Quick actions & workbench'],
    subsections: [
      {
        id: 'dashboard-kpi-header',
        title: 'Summary KPI Header',
        summary: 'Four KPI cards surface the most important operating numbers as soon as the page loads.',
        bullets: [
          'Active States counts the distinct states with open orders for the current user.',
          'Signed Retainers routes into My Cases from the dashboard.',
          'Pending Invoices gives a fast count of invoice work that still needs review.',
          'Total Invoiced splits paid dollars from pending dollars inside the card.'
        ],
        components: [
          {
            label: 'Active States card',
            icon: 'i-lucide-map-pin',
            description: 'Counts active order states and opens the Order Map.'
          },
          {
            label: 'Signed Retainers card',
            icon: 'i-lucide-briefcase',
            description: 'Shows the current retainer count and opens My Cases.'
          },
          {
            label: 'Pending Invoices card',
            icon: 'i-lucide-clock',
            description: 'Highlights invoices awaiting follow-up and links into invoicing.'
          },
          {
            label: 'Total Invoiced card',
            icon: 'i-lucide-circle-dollar-sign',
            description: 'Rolls up billed revenue with paid and pending amounts.'
          }
        ]
      },
      {
        id: 'dashboard-invoice-trend',
        title: 'Invoice Trend',
        summary: 'The main chart gives lawyers a rolling six-month view of billing performance.',
        bullets: [
          'The line and area chart plots total amount by month.',
          'A month-over-month badge compares the latest month against the prior month.',
          'Hover states expose a crosshair tooltip with both dollars and invoice count.',
          'The strip below the chart repeats each month\'s total and invoice volume.'
        ],
        components: [
          {
            label: 'Trend chart',
            icon: 'i-lucide-chart-spline',
            description: 'Plots the last six months of invoice totals.'
          },
          {
            label: 'Growth badge',
            icon: 'i-lucide-trending-up',
            description: 'Shows percentage movement versus the previous month.'
          },
          {
            label: 'Crosshair tooltip',
            icon: 'i-lucide-mouse-pointer-click',
            description: 'Reveals amount and invoice count for the hovered month.'
          },
          {
            label: 'Monthly strip',
            icon: 'i-lucide-calendar-range',
            description: 'Pins each month\'s amount and invoice count beneath the chart.'
          }
        ]
      },
      {
        id: 'dashboard-actions-breakdown',
        title: 'Quick Actions and Breakdown',
        summary: 'The right rail mixes fast shortcuts with a compact invoice-status snapshot.',
        bullets: [
          'Open Order Map is always available and opens the state coverage view.',
          'Create Invoice appears only for admin and super-admin roles.',
          'Invoice Breakdown shows billable, pending, and paid status totals.'
        ],
        components: [
          {
            label: 'Open Order Map',
            icon: 'i-lucide-plus',
            description: 'Jumps straight to the Order Map from the dashboard.'
          },
          {
            label: 'Create Invoice',
            icon: 'i-lucide-receipt',
            description: 'Admin-only shortcut for creating a new invoice.'
          },
          {
            label: 'View Signed Retainers',
            icon: 'i-lucide-briefcase',
            description: 'Shortcut that opens the My Cases page.'
          },
          {
            label: 'Invoice Breakdown',
            icon: 'i-lucide-chart-no-axes-column',
            description: 'Visualizes invoice volume across billable, pending, and paid states.'
          }
        ]
      },
      {
        id: 'dashboard-workbench',
        title: 'Tabbed Data Management',
        summary: 'The lower workbench rotates between recent signed retainers and invoices so teams can jump from summary to records quickly.',
        bullets: [
          'Each tab shows the five most recent rows or cards for that data set.',
          'Signed Retainers displays recent clients, phone numbers, status, and linked invoice access when available.',
          'Invoices shows invoice number, amount, date context, and status badges.'
        ],
        components: [
          {
            label: 'Signed Retainers tab',
            icon: 'i-lucide-briefcase',
            description: 'Lists the newest retainer records from My Cases.'
          },
          {
            label: 'Invoices tab',
            icon: 'i-lucide-receipt',
            description: 'Surfaces the latest invoice records and status labels.'
          },
          {
            label: 'See All action',
            icon: 'i-lucide-arrow-right',
            description: 'Routes to My Cases or Invoicing based on the active tab.'
          }
        ]
      }
    ]
  },
  {
    id: 'order-map',
    number: '02',
    title: 'Order Map',
    icon: 'i-lucide-map',
    overview: 'The Order Map is the portal\'s geographic control center. Lawyers use it to inspect territory availability and manage general coverage preferences by state.',
    highlights: ['State-based territory map', 'General Coverage editor', 'Coverage summary'],
    subsections: [
      {
        id: 'order-map-geography',
        title: 'Geographic Interface and Statistics',
        summary: 'The map card pairs color-coded territory feedback with coverage details so lawyers can judge coverage at a glance.',
        bullets: [
          'States show whether general coverage is configured, partially configured, or unavailable.',
          'The legend explains general coverage status and temporarily unavailable territories.',
          'Hover tooltips show state-level coverage details.',
          'The map updates after general coverage preferences are saved.'
        ],
        components: [
          {
            label: 'Coverage status',
            icon: 'i-lucide-panels-top-left',
            description: 'Shows how the selected state fits the firm\'s general coverage.'
          },
          {
            label: 'Interactive map',
            icon: 'i-lucide-map',
            description: 'Color-codes states based on general coverage and availability.'
          },
          {
            label: 'Legend and map filter',
            icon: 'i-lucide-list-filter',
            description: 'Explains map colors and lets the user focus the territory view.'
          },
          {
            label: 'State tooltip',
            icon: 'i-lucide-mouse-pointer-click',
            description: 'Shows state-level coverage details and availability notes.'
          }
        ]
      },
      {
        id: 'order-map-create',
        title: 'Managing General Coverage',
        summary: 'General Coverage captures the firm\'s active state preferences and qualifying criteria.',
        bullets: [
          'Create Coverage opens the editable general coverage form.',
          'The form captures covered states, case category, injury severity, liability, insurance, medical treatment, languages, and client requirements.',
          'Temporarily unavailable states cannot be selected.',
          'Saved coverage immediately updates the map and summary section.'
        ],
        note: 'Urgency order creation is temporarily disabled in the live Order Map and kept in code for future reuse.',
        components: [
          {
            label: 'Create Coverage trigger',
            icon: 'i-lucide-plus',
            description: 'Opens the general coverage form from the page header.'
          },
          {
            label: 'Covered states',
            icon: 'i-lucide-shield-check',
            description: 'Selects the states covered by the firm.'
          },
          {
            label: 'Criteria form',
            icon: 'i-lucide-sliders-horizontal',
            description: 'Captures case targeting and qualification settings.'
          },
          {
            label: 'Availability restrictions',
            icon: 'i-lucide-alert-triangle',
            description: 'Explains unavailable state selections.'
          }
        ]
      },
      {
        id: 'order-map-manage-orders',
        title: 'Reviewing General Coverage',
        summary: 'The General Coverage section keeps the current coverage setup visible beneath the map.',
        bullets: [
          'The header shows whether coverage exists and exposes the Edit action.',
          'Saved criteria remain visible for review.',
          'Users can return to the editor without leaving the map page.',
          'The empty state points users back to Create Coverage.'
        ],
        components: [
          {
            label: 'Coverage header',
            icon: 'i-lucide-shield',
            description: 'Shows the current General Coverage section state.'
          },
          {
            label: 'Edit action',
            icon: 'i-lucide-pencil',
            description: 'Reopens the coverage form for changes.'
          },
          {
            label: 'Coverage details',
            icon: 'i-lucide-list-checks',
            description: 'Keeps saved states and criteria visible beneath the map.'
          }
        ]
      }
    ]
  },
  {
    id: 'my-cases',
    number: '03',
    title: 'My Cases',
    icon: 'i-lucide-briefcase',
    overview: 'My Cases acts as the firm\'s daily review board for submitted retainers. It emphasizes stage movement, searchable customer records, and a fast way to open the underlying case details.',
    highlights: ['Kanban case pipeline', 'Search, date, and state filters', 'Confirmation-based stage moves'],
    subsections: [
      {
        id: 'my-cases-status-cards',
        title: 'Status Counter Cards',
        summary: 'The header cards show where the current book of retained cases is sitting in the review lifecycle.',
        bullets: [
          'Signed Retainer counts cases that still need the first intake pass.',
          '24 Hour Review surfaces the intermediate review window.',
          'Approved shows retainers that cleared review and are ready for the next action.',
          'Disqualified keeps a visible count of cases that did not meet the pre-agreed criteria.'
        ],
        components: [
          {
            label: 'Signed Retainer',
            icon: 'i-lucide-user-plus',
            description: 'Counts retainers waiting for initial review.'
          },
          {
            label: '24 Hour Review',
            icon: 'i-lucide-clock',
            description: 'Tracks cases currently in the 24 hour review window.'
          },
          {
            label: 'Approved',
            icon: 'i-lucide-check-circle',
            description: 'Shows the total number of reviewed and accepted retainers.'
          },
          {
            label: 'Disqualified',
            icon: 'i-lucide-x-circle',
            description: 'Counts retainers that did not meet the pre-agreed criteria.'
          }
        ]
      },
      {
        id: 'my-cases-filtering',
        title: 'Search and Filtering',
        summary: 'The toolbar keeps the board usable by combining search, date controls, and a shared filter drawer layout.',
        bullets: [
          'Search matches customer names, phone numbers, submission IDs, vendor names, attorney names, and state codes.',
          'The date selector supports presets plus a custom calendar range.',
          'State filtering is active inside the drawer, while the remaining criteria preserve the shared order-taxonomy layout.',
          'Reset all clears the search query, date selection, and active filter values in one step.'
        ],
        note: 'Today, the live narrowing is driven by search, date range, and state selections while the rest of the shared criteria layout is staged into the page.',
        components: [
          {
            label: 'Search bar',
            icon: 'i-lucide-search',
            description: 'Finds customers and related metadata without leaving the board.'
          },
          {
            label: 'Date range picker',
            icon: 'i-lucide-calendar-range',
            description: 'Filters cards by preset windows or a custom date span.'
          },
          {
            label: 'Filters drawer',
            icon: 'i-lucide-filter',
            description: 'Keeps advanced criteria available without crowding the default workspace.'
          },
          {
            label: 'Reset all',
            icon: 'i-lucide-rotate-ccw',
            description: 'Returns the board to its broadest view with one click.'
          }
        ]
      },
      {
        id: 'my-cases-pipeline',
        title: 'Pipeline Columns',
        summary: 'Each retained case appears as a card inside a four-column review flow that can be updated from the board.',
        bullets: [
          'Columns are organized as Signed Retainer, 24 Hour Review, Customer Approved, and Disqualified.',
          'Cards show initials, client name, phone number, sign date, and state code.',
          'Dragging a card opens a confirmation step before the status is written back.',
          'Clicking any card opens the retainer detail record for deeper case review.'
        ],
        components: [
          {
            label: 'Signed Retainer column',
            icon: 'i-lucide-columns-2',
            description: 'The starting lane for newly submitted retainers.'
          },
          {
            label: '24 Hour Review column',
            icon: 'i-lucide-hourglass',
            description: 'Holds cases being checked during the 24 hour review window.'
          },
          {
            label: 'Approved and Disqualified columns',
            icon: 'i-lucide-arrow-right-left',
            description: 'Separate successful retainers from disqualified ones for cleaner follow-up.'
          },
          {
            label: 'Retainer card',
            icon: 'i-lucide-id-card',
            description: 'Packages the customer identity, date, and state into one draggable card.'
          },
          {
            label: 'Move confirmation',
            icon: 'i-lucide-message-square-warning',
            description: 'Confirms the stage change before the database status is updated.'
          }
        ]
      },
      {
        id: 'my-cases-refresh',
        title: 'Live Data Refresh',
        summary: 'Refresh reloads the board from the latest retainer sources without requiring a full browser refresh.',
        bullets: [
          'Use Refresh after intake has pushed new signings or review statuses have changed.',
          'The control preserves the board layout while reloading the underlying data.'
        ],
        components: [
          {
            label: 'Refresh button',
            icon: 'i-lucide-refresh-cw',
            description: 'Re-syncs the My Cases board with the latest retainer records.'
          }
        ]
      }
    ]
  },
  {
    id: 'fulfillment',
    number: '04',
    title: 'Fulfillment',
    icon: 'i-lucide-package',
    overview: 'Fulfillment is an internal attorney workspace for classifying assigned cases after they enter the firm workflow. Attorneys can move cases freely without changing review, invoicing, or settlement status.',
    highlights: ['Case summary header', 'State/stage filters', 'Drag-and-drop attorney board'],
    subsections: [
      {
        id: 'fulfillment-performance',
        title: 'Fulfillment Performance Header',
        summary: 'Four top cards summarize the attorney-managed fulfillment classifications before the board is opened.',
        bullets: [
          'Signed Cases shows assigned cases before the attorney moves them into another fulfillment stage.',
          'Active Cases tracks cases the attorney is actively managing.',
          'Dropped Cases and Successful Cases keep attorney-classified outcomes visible side by side.',
          'These fulfillment stages are independent from My Cases, invoicing, and settlement statuses.'
        ],
        components: [
          {
            label: 'Signed Cases',
            icon: 'i-lucide-check-circle',
            description: 'Shows cases ready for attorney-managed fulfillment classification.'
          },
          {
            label: 'Active Cases',
            icon: 'i-lucide-activity',
            description: 'Tracks cases currently being worked by the attorney.'
          },
          {
            label: 'Dropped Cases',
            icon: 'i-lucide-x-circle',
            description: 'Counts cases the attorney classified as dropped.'
          },
          {
            label: 'Successful Cases',
            icon: 'i-lucide-trophy',
            description: 'Shows cases the attorney classified as successful.'
          }
        ]
      },
      {
        id: 'fulfillment-filters',
        title: 'Fulfillment Filters',
        summary: 'The toolbar narrows the board by person, geography, and fulfillment stage.',
        bullets: [
          'Search matches client name, phone number, ID, status, state, vendor, attorney, and fulfillment stage.',
          'State filtering supports a multi-select All States pattern.',
          'Stages filters the board to a specific fulfillment outcome when needed.'
        ],
        components: [
          {
            label: 'Search Cases',
            icon: 'i-lucide-search',
            description: 'Finds a lead quickly by name, phone, or related metadata.'
          },
          {
            label: 'State filter',
            icon: 'i-lucide-map-pinned',
            description: 'Narrows the board to one or more geographies.'
          },
          {
            label: 'Stages filter',
            icon: 'i-lucide-columns-4',
            description: 'Limits the visible cards to one fulfillment stage at a time.'
          },
          {
            label: 'Reset all',
            icon: 'i-lucide-rotate-ccw',
            description: 'Clears every active fulfillment filter in one click.'
          }
        ]
      },
      {
        id: 'fulfillment-pipeline',
        title: 'Fulfillment Pipeline',
        summary: 'The board lets attorneys classify assigned cases in a fulfillment-only workspace.',
        bullets: [
          'Columns are Signed Cases, Active Cases, Dropped Cases, and Successful Cases.',
          'Cards show client name, phone, state, date, attorney context, optional reason text, and signed date when present.',
          'Drag and drop updates only the fulfillment stage on the lead record.',
          'Empty columns show a No Cases state so gaps are obvious immediately.'
        ],
        components: [
          {
            label: 'Signed Cases lane',
            icon: 'i-lucide-check-check',
            description: 'The entry lane for assigned cases before attorney classification.'
          },
          {
            label: 'Active Cases lane',
            icon: 'i-lucide-activity',
            description: 'Captures cases the attorney is actively managing.'
          },
          {
            label: 'Dropped Cases lane',
            icon: 'i-lucide-circle-off',
            description: 'Separates attorney-classified dropped cases from active and successful work.'
          },
          {
            label: 'Successful Cases lane',
            icon: 'i-lucide-award',
            description: 'Highlights cases the attorney classified as successful.'
          },
          {
            label: 'Fulfillment card',
            icon: 'i-lucide-contact',
            description: 'Packages the client, state, date, and outcome context into one draggable record.'
          }
        ]
      },
      {
        id: 'fulfillment-refresh',
        title: 'Global Navigation and Refresh',
        summary: 'Because attorneys can move cases freely, refresh is the fastest way to trust the board after parallel updates.',
        bullets: [
          'Refresh reloads counts and cards without leaving the page.',
          'The header keeps the action available even while the rest of the board is in view.'
        ],
        components: [
          {
            label: 'Refresh button',
            icon: 'i-lucide-refresh-cw',
            description: 'Reloads the fulfillment metrics and board in place.'
          }
        ]
      }
    ]
  },
  {
    id: 'invoicing',
    number: '05',
    title: 'Invoicing',
    icon: 'i-lucide-receipt',
    overview: 'Invoicing is the portal\'s financial ledger. It tracks what is ready to bill, what is pending payment, what is late, and what has been paid successfully.',
    highlights: ['Financial summary cards', 'Board or list view', 'Role-aware filters'],
    subsections: [
      {
        id: 'invoicing-summary',
        title: 'Financial Summary Header',
        summary: 'The first row condenses the visible invoice portfolio into five financial totals.',
        bullets: [
          'Total Invoiced rolls up every invoice amount in the current portfolio.',
          'Billable represents invoice-ready value in the main lawyer flow.',
          'Pending Payment, Late Payment, and Successful Payment show the money currently in those buckets.',
          'These cards refresh with the page data and stay aligned to the visible mode.'
        ],
        components: [
          {
            label: 'Total Invoiced',
            icon: 'i-lucide-receipt',
            description: 'Shows the gross invoiced amount across the loaded records.'
          },
          {
            label: 'Billable',
            icon: 'i-lucide-file-check',
            description: 'Tracks revenue that is ready for billing work.'
          },
          {
            label: 'Pending Payment',
            icon: 'i-lucide-clock',
            description: 'Shows invoice value that is still waiting on payment or review.'
          },
          {
            label: 'Late Payment',
            icon: 'i-lucide-alert-circle',
            description: 'Highlights invoice value that needs late-payment follow-up.'
          },
          {
            label: 'Successful Payment',
            icon: 'i-lucide-check-circle',
            description: 'Totals funds that have already been collected successfully.'
          }
        ]
      },
      {
        id: 'invoicing-tools',
        title: 'Invoicing Tools and Display Controls',
        summary: 'The toolbar gives teams search, date, filter, and layout controls without leaving the ledger.',
        bullets: [
          'Search scans invoice number, party names, lead names, line-item descriptions, and notes.',
          'Date presets and a custom calendar range help narrow the billing period under review.',
          'The filter drawer supports statuses, due dates, states in lawyer mode, and attorney or vendor selection for broader roles.',
          'Board and List toggles switch the presentation while keeping the same underlying result set.'
        ],
        components: [
          {
            label: 'Search invoices',
            icon: 'i-lucide-search',
            description: 'Finds invoices by ID, names, descriptions, and notes.'
          },
          {
            label: 'Date range picker',
            icon: 'i-lucide-calendar-range',
            description: 'Filters invoice history by preset or custom windows.'
          },
          {
            label: 'Filters drawer',
            icon: 'i-lucide-filter',
            description: 'Surfaces status, due-date, geography, and party filters.'
          },
          {
            label: 'Board/List toggle',
            icon: 'i-lucide-panel-top',
            description: 'Lets the user swap between kanban and tabular invoice views.'
          },
          {
            label: 'Create Invoice',
            icon: 'i-lucide-plus',
            description: 'Admin-enabled action for starting a new invoice record.'
          }
        ]
      },
      {
        id: 'invoicing-board',
        title: 'Invoicing Pipeline',
        summary: 'Board view groups invoice work into status columns so money movement is visible without reading a flat ledger.',
        bullets: [
          'Columns are Billable, Pending Payment, Late Payment, and Successful Payment in the lawyer flow.',
          'The billable side can also surface ready-to-invoice deal cards before a formal invoice is created.',
          'Invoice cards show the invoice number, amount, due date, billing period, item count, and party context.',
          'Pending Payment cards expose successful-payment actions, while Successful Payment cards can move into late-payment handling.'
        ],
        components: [
          {
            label: 'Billable column',
            icon: 'i-lucide-file-plus',
            description: 'Holds invoice-ready work before it is fully collected.'
          },
          {
            label: 'Pending Payment column',
            icon: 'i-lucide-hourglass',
            description: 'Shows invoices that have been issued and still need payment progress.'
          },
          {
            label: 'Late Payment column',
            icon: 'i-lucide-badge-alert',
            description: 'Tracks invoices that need late-payment follow-up.'
          },
          {
            label: 'Successful Payment column',
            icon: 'i-lucide-badge-dollar-sign',
            description: 'Keeps completed invoice collections visible in one place.'
          },
          {
            label: 'Ready deal card',
            icon: 'i-lucide-file-check-2',
            description: 'Shows qualified billing candidates that can be converted into invoices.'
          },
          {
            label: 'Invoice card actions',
            icon: 'i-lucide-hand-coins',
            description: 'Provides quick actions like Mark Successful, Late Payment, Edit, and PDF.'
          }
        ]
      },
      {
        id: 'invoicing-refresh',
        title: 'Global Controls',
        summary: 'Refresh and list mode keep the invoice ledger trustworthy even when statuses are changing quickly.',
        bullets: [
          'Refresh reloads invoice data without a full page reload.',
          'List view adds sticky table headers and pagination for denser financial review.',
          'Pagination helps teams scan large invoice sets without losing the current filters.'
        ],
        components: [
          {
            label: 'Refresh button',
            icon: 'i-lucide-refresh-cw',
            description: 'Re-syncs the ledger with the latest invoice state.'
          },
          {
            label: 'List view table',
            icon: 'i-lucide-table-properties',
            description: 'Presents invoices in a denser spreadsheet-style layout.'
          },
          {
            label: 'Pagination',
            icon: 'i-lucide-chevrons-left-right',
            description: 'Moves through long invoice result sets without losing context.'
          }
        ]
      }
    ]
  },
  {
    id: 'product-offering',
    number: '06',
    title: 'Product Offering',
    icon: 'i-lucide-tag',
    overview: 'Product Offering explains how the portal packages case inventory into pricing tiers. It helps firms compare lead quality signals before handing off into the ordering workflow.',
    highlights: ['Consumer/commercial toggle', 'Tier comparison cards', 'Direct order handoff'],
    subsections: [
      {
        id: 'product-offering-tiers',
        title: 'Pricing Tiers',
        summary: 'The page compares consumer and commercial offerings through pricing cards that translate case quality into buying options.',
        bullets: [
          'Consumer mode shows Tier 1 Transfer, Tier 2 Bronze, Tier 3 Silver, and Tier 4 Gold.',
          'Each card combines a price-per-case headline with four comparison rows.',
          'Commercial mode collapses to a single commercial card.',
          'A paused-order notice appears whenever the commercial category is selected.'
        ],
        components: [
          {
            label: 'Category toggle',
            icon: 'i-lucide-arrow-left-right',
            description: 'Switches the page between consumer and commercial offerings.'
          },
          {
            label: 'Tier 1 Transfer',
            icon: 'i-lucide-circle',
            description: 'The entry-level consumer tier with the lowest case price.'
          },
          {
            label: 'Tier 2 Bronze',
            icon: 'i-lucide-medal',
            description: 'Mid-range consumer pricing with stronger quality criteria.'
          },
          {
            label: 'Tier 3 Silver',
            icon: 'i-lucide-badge',
            description: 'Higher-intent consumer tier with stronger documentation expectations.'
          },
          {
            label: 'Tier 4 Gold',
            icon: 'i-lucide-award',
            description: 'The premium consumer tier for the strongest qualifying cases.'
          },
          {
            label: 'Commercial card',
            icon: 'i-lucide-truck',
            description: 'The commercial offering card shown when the category is switched.'
          }
        ]
      },
      {
        id: 'product-offering-criteria',
        title: 'Evaluation Criteria',
        summary: 'Every tier card uses the same four criteria so firms can compare value consistently across the catalog.',
        bullets: [
          'Documentation explains how complete the supporting file should be.',
          'Type of Injury frames the expected severity range.',
          'Accident Occurred sets the 0–12 month date-of-accident window.',
          'Liability captures how strong the claim should be before purchase.'
        ],
        components: [
          {
            label: 'Documentation',
            icon: 'i-lucide-file-check',
            description: 'Lists the level of proof or paperwork expected with the case.'
          },
          {
            label: 'Type of Injury',
            icon: 'i-lucide-heart-pulse',
            description: 'Describes the medical severity expected for the tier.'
          },
          {
            label: 'Accident Occurred',
            icon: 'i-lucide-calendar-clock',
            description: 'Shows that the qualifying incident should be within the last 12 months.'
          },
          {
            label: 'Liability',
            icon: 'i-lucide-scale',
            description: 'Signals how strong or accepted the claim should be.'
          }
        ]
      },
      {
        id: 'product-offering-ordering',
        title: 'Order Map Handoff',
        summary: 'Product Offering is not just pricing reference material. Each active card can hand the buyer into the Order Map.',
        bullets: [
          'Every active card includes an Open Order Map button.',
          'That action routes into the Order Map state coverage view.',
          'Commercial ordering is currently disabled while the paused notice is active.',
          'Urgency order creation is temporarily disabled and can be re-enabled from the Order Map code path later.'
        ],
        note: 'The live product currently opens the Order Map from Product Offering without preloading the tier\'s filters into the form.',
        components: [
          {
            label: 'Open Order Map button',
            icon: 'i-lucide-arrow-right',
            description: 'Hands the user into the Order Map from a pricing card.'
          },
          {
            label: 'Commercial paused notice',
            icon: 'i-lucide-info',
            description: 'Explains why the commercial action is disabled right now.'
          },
          {
            label: 'Order Map handoff',
            icon: 'i-lucide-map-pinned',
            description: 'Routes the user to Order Map.'
          }
        ]
      }
    ]
  }
]
