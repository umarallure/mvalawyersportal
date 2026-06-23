import type { ProductGuideTarget } from '../lib/product-guide-navigation'

export type ProductGuideHintContent = {
  title: string
  description: string
  guideTarget?: ProductGuideTarget
}

export const productGuideHints = {
  dashboard: {
    retainersCard: {
      title: 'Signed Retainers',
      description: 'Shows how many signed retainers are currently assigned and links into the My Cases review board.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    activeStatesCard: {
      title: 'Active States',
      description: 'Counts the distinct states with open orders for the current user and opens the Order Map.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    totalInvoicedCard: {
      title: 'Total Invoiced',
      description: 'Rolls up invoice value across the loaded records and highlights how much is already paid versus still pending.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    pendingInvoicesCard: {
      title: 'Pending Invoices',
      description: 'Tracks invoice work that still needs payment follow-up or review and opens the invoicing workspace.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    invoiceTrend: {
      title: 'Invoice Trend',
      description: 'Visualizes billing activity across the last six months so month-over-month movement is easy to spot.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-invoice-trend' }
    },
    quickActions: {
      title: 'Quick Actions',
      description: 'Provides direct shortcuts into the most common workflows: placing orders, creating invoices, and reviewing retainers.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-actions-breakdown' }
    },
    invoiceBreakdown: {
      title: 'Invoice Breakdown',
      description: 'Summarizes invoice volume across billable, pending, and paid stages.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-actions-breakdown' }
    },
    workbench: {
      title: 'Workbench',
      description: 'Rotates between recent signed retainers and invoices so you can jump from summary metrics into live records quickly.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-workbench' }
    }
  },
  orderMap: {
    createOrder: {
      title: 'Order Map Controls',
      description: 'Opens the Order Map controls for managing general coverage while urgency orders are disabled.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-create' }
    },
    map: {
      title: 'Interactive Map',
      description: 'Color-codes each state based on order availability and progress. Hovering a state shows live order counts, quota details, and capacity warnings.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-geography' }
    },
    myOrders: {
      title: 'My Orders',
      description: 'Lists the firm\'s active and closed orders with status, quota progress, and expiration so campaigns can be compared in one place.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-manage-orders' }
    },
    filters: {
      title: 'Order Filters',
      description: 'Narrows the My Orders list by geography and order criteria without leaving the map page.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-manage-orders' }
    }
  },
  myCases: {
    newForReviewCard: {
      title: 'Signed Retainer',
      description: 'Counts signed retainers that are ready for the first attorney review pass.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    approvalCard: {
      title: '24 Hour Review',
      description: 'Tracks cases that are currently sitting inside the 24 hour review window before a final outcome is recorded.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    approvedCard: {
      title: 'Approved',
      description: 'Shows how many retainers have been reviewed and accepted.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    rejectedCard: {
      title: 'Disqualified',
      description: 'Shows how many retainers did not meet the pre-agreed criteria.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    filters: {
      title: 'Search and Filters',
      description: 'Combines keyword search, date filtering, and staged criteria so reviewers can isolate the right set of cases quickly.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-filtering' }
    },
    myCasesColumn: {
      title: 'Signed Retainer',
      description: 'The starting lane for signed retainers that still need attorney review.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    },
    approvalColumn: {
      title: '24 Hour Review',
      description: 'Holds cases that are still being evaluated during the 24 hour review window.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    },
    approvedColumn: {
      title: 'Customer Approved',
      description: 'Contains retained cases that passed review and moved into an accepted state.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    },
    rejectedColumn: {
      title: 'Disqualified',
      description: 'Contains retained cases that did not meet the pre-agreed criteria so follow-up stays separate from approved work.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    }
  },
  fulfillment: {
    signedCasesCard: {
      title: 'Signed Cases',
      description: 'Shows assigned cases that are ready for attorney-managed fulfillment classification.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    activeCasesCard: {
      title: 'Active Cases',
      description: 'Tracks cases the attorney is actively working inside the fulfillment workspace.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    droppedCasesCard: {
      title: 'Dropped Cases',
      description: 'Shows cases the attorney classified as no longer active or progressing.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    successfulCasesCard: {
      title: 'Successful Cases',
      description: 'Highlights cases the attorney classified as successful.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    filters: {
      title: 'Fulfillment Filters',
      description: 'Lets the team narrow the board by search terms, geography, and fulfillment stage.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-filters' }
    },
    signedColumn: {
      title: 'Signed Cases',
      description: 'The entry lane for assigned cases before the attorney moves them into a fulfillment classification.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    },
    activeColumn: {
      title: 'Active Cases',
      description: 'Captures cases the attorney is actively managing inside fulfillment.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    },
    droppedColumn: {
      title: 'Dropped Cases',
      description: 'Separates cases the attorney classified as dropped from active and successful work.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    },
    successfulColumn: {
      title: 'Successful Cases',
      description: 'Shows cases the attorney classified as successful.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    }
  },
  invoicing: {
    totalInvoicedCard: {
      title: 'Total Invoiced',
      description: 'Shows the gross invoice value across the loaded records.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    billableCard: {
      title: 'Billable',
      description: 'Represents invoice-ready value that can still be processed into or through the billing workflow.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    pendingCard: {
      title: 'Pending Payment',
      description: 'Tracks invoice value that has moved past billable and still needs payment progress.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    paidCard: {
      title: 'Successful Payment',
      description: 'Shows invoice value that has already been collected successfully.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    chargebackCard: {
      title: 'Late Payment',
      description: 'Highlights invoice value that needs late-payment follow-up.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    createInvoice: {
      title: 'Create Invoice',
      description: 'Starts a new invoice record for the current invoicing mode and is available only to authorized roles.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-tools' }
    },
    toolbar: {
      title: 'Invoice Toolbar',
      description: 'Combines search, date controls, advanced filters, and result counts so teams can narrow the ledger without changing pages.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-tools' }
    },
    viewToggle: {
      title: 'Board and List Views',
      description: 'Switches between a pipeline-style invoice board and a denser ledger table while keeping the same result set.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-tools' }
    },
    billableColumn: {
      title: 'Billable',
      description: 'Holds invoice-ready work before it is fully collected.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    pendingColumn: {
      title: 'Pending Payment',
      description: 'Shows invoices that have been issued and still need payment progress.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    paidColumn: {
      title: 'Successful Payment',
      description: 'Keeps successfully collected invoices visible in one place.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    chargebackColumn: {
      title: 'Late Payment',
      description: 'Tracks invoices that need late-payment follow-up.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    pagination: {
      title: 'Pagination',
      description: 'Moves through larger invoice result sets without losing the current filters or view mode.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-refresh' }
    }
  },
  productOffering: {
    overview: {
      title: 'Product Offering',
      description: 'Explains how consumer and commercial case inventory is packaged into pricing tiers before the buyer moves into ordering.',
      guideTarget: { sectionId: 'product-offering' }
    },
    categoryToggle: {
      title: 'Case Category',
      description: 'Switches the catalog between consumer and commercial offerings.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    transferTier: {
      title: 'Tier 1 Transfer',
      description: 'The entry-level consumer tier with the lowest price point.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    bronzeTier: {
      title: 'Tier 2 Bronze',
      description: 'A mid-range consumer tier with stronger case quality expectations than transfer.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    silverTier: {
      title: 'Tier 3 Silver',
      description: 'A higher-intent consumer tier with stronger documentation requirements.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    goldTier: {
      title: 'Tier 4 Gold',
      description: 'The premium consumer tier focused on the strongest qualifying cases.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    commercialTier: {
      title: 'Commercial',
      description: 'The commercial offering card used when the catalog is switched into commercial mode.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    placeOrder: {
      title: 'Open Order Map',
      description: 'Hands the buyer into the Order Map from the selected pricing tier while urgency orders are disabled.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-ordering' }
    }
  }
} as const
