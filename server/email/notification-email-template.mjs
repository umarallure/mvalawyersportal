const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const normalizeBaseUrl = (value) => {
  const baseUrl = String(value ?? '').trim()
  if (!baseUrl) throw new Error('Missing appBaseUrl')
  return baseUrl.replace(/\/+$/g, '')
}

const buildPortalUrl = (appBaseUrl, redirectUrl) => {
  const path = String(redirectUrl ?? '').trim() || '/notifications'
  if (/^https?:\/\//i.test(path)) return path
  return `${appBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

const getPublicAssetUrl = (appBaseUrl, assetPath) =>
  buildPortalUrl(appBaseUrl, assetPath.startsWith('/') ? assetPath : `/${assetPath}`)

const formatAssignedDate = (iso) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

export const buildNotificationEmailContent = (delivery, options) => {
  const appBaseUrl = normalizeBaseUrl(options?.appBaseUrl)
  const portalUrl = buildPortalUrl(appBaseUrl, delivery.redirect_url)
  const notificationsUrl = buildPortalUrl(appBaseUrl, '/notifications')
  const logoUrl = options?.logoUrl?.trim() || getPublicAssetUrl(appBaseUrl, '/assets/logo.svg')
  const bgUrl = options?.backgroundUrl?.trim() || getPublicAssetUrl(appBaseUrl, '/assets/email.jpg')
  const caseName = delivery.lead_name?.trim() || 'New case'
  const description = delivery.description?.trim() || ''
  const assignedDate = formatAssignedDate(delivery.delivery_created_at || delivery.created_at)
  const year = new Date().getFullYear()

  const defaultBody =
    "It's in your My Cases workspace and ready for review. Open the case to see the client details, documents, and what needs your attention first."
  const bodyCopy = description || defaultBody

  const safeCaseName = escapeHtml(caseName)
  const safeBody = escapeHtml(bodyCopy)
  const safePortalUrl = escapeHtml(portalUrl)
  const safeNotificationsUrl = escapeHtml(notificationsUrl)
  const safeLogoUrl = escapeHtml(logoUrl)
  const safeBgUrl = escapeHtml(bgUrl)
  const subject = `New case assigned: ${caseName}`

  const fontStack = "'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif"

  const text = [
    "You've been assigned a new case in the Accident Payments Lawyer Portal.",
    '',
    `Case: ${caseName}`,
    assignedDate ? `Assigned: ${assignedDate}` : null,
    '',
    bodyCopy,
    '',
    `Open the case: ${portalUrl}`,
    `All notifications: ${notificationsUrl}`,
    '',
    "You're getting this because a case was assigned to your Lawyer Portal account. If that doesn't look right, contact your administrator.",
    '',
    `Copyright ${year} Accident Payments`
  ]
    .filter((line) => line !== null)
    .join('\n')

  const addedLine = assignedDate
    ? `<div style="height:1px;line-height:1px;font-size:1px;background:rgba(255,255,255,0.08);margin:16px 0 14px 0;">&nbsp;</div>`
      + `<p class="ap-date-text" style="margin:0;color:#8f8780;-webkit-text-fill-color:#8f8780;font-size:13px;line-height:1.5;font-family:${fontStack};">Added <span class="ap-date-value" style="color:#cfc4ba;-webkit-text-fill-color:#cfc4ba;">${escapeHtml(assignedDate)}</span></p>`
    : ''

  const mobileCss =
    '@media (max-width:620px){body,.ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;padding:18px 10px !important;}.ap-card{background:#0b0b0d !important;background-color:#0b0b0d !important;background-image:linear-gradient(#0b0b0d,#0b0b0d) !important;border:1px solid #30251d !important;border-radius:18px !important;}.ap-pad{padding-left:22px !important;padding-right:22px !important;}.ap-header{background:#080808 !important;background-color:#080808 !important;background-image:linear-gradient(#080808,#080808) !important;padding-top:24px !important;padding-bottom:22px !important;}.ap-logo-cell,.ap-pill-cell{display:block !important;width:100% !important;text-align:left !important;}.ap-pill-cell{padding-top:14px !important;}.ap-pill{background:#111113 !important;background-color:#111113 !important;background-image:linear-gradient(#111113,#111113) !important;border:1px solid #3a2e25 !important;}.ap-pill-dot,.ap-case-label,.ap-secondary-link,.ap-secondary-text{color:#f7c480 !important;-webkit-text-fill-color:#f7c480 !important;}.ap-pill-text{color:#e4dbd2 !important;-webkit-text-fill-color:#e4dbd2 !important;}.ap-lead{padding-top:30px !important;}.ap-lead-text{color:#f7f1eb !important;-webkit-text-fill-color:#f7f1eb !important;}.ap-hero,.ap-case-title{font-size:25px !important;line-height:1.2 !important;color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;}.ap-case-card{background:#121213 !important;background-color:#121213 !important;background-image:linear-gradient(#121213,#121213) !important;border:1px solid #342820 !important;}.ap-date-text{color:#a99f96 !important;-webkit-text-fill-color:#a99f96 !important;}.ap-date-value{color:#ddd4cc !important;-webkit-text-fill-color:#ddd4cc !important;}.ap-copy{color:#d8cec4 !important;-webkit-text-fill-color:#d8cec4 !important;}.ap-actions{width:100% !important;}.ap-btn-cell{display:block !important;width:100% !important;background:#ae4010 !important;background-color:#ae4010 !important;background-image:linear-gradient(#ae4010,#ae4010) !important;border-radius:14px !important;}.ap-btn{display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important;color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;}.ap-btn-text{color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;}.ap-secondary-cell{display:block !important;width:100% !important;padding-left:0 !important;padding-top:16px !important;text-align:center !important;}.ap-secondary-link{display:block !important;margin:0 !important;padding:0 !important;text-align:center !important;color:#f7c480 !important;-webkit-text-fill-color:#f7c480 !important;}.ap-footer{background:#080808 !important;background-color:#080808 !important;background-image:linear-gradient(#080808,#080808) !important;}.ap-footer-text{color:#bfb5ac !important;-webkit-text-fill-color:#bfb5ac !important;}.ap-footer-meta{color:#928a83 !important;-webkit-text-fill-color:#928a83 !important;}}'

  const mobileDarkCss =
    '@media (max-width:620px) and (prefers-color-scheme:dark){body,.ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;}.ap-card{background:#0b0b0d !important;background-color:#0b0b0d !important;background-image:linear-gradient(#0b0b0d,#0b0b0d) !important;border-color:#30251d !important;}.ap-header,.ap-footer{background:#080808 !important;background-color:#080808 !important;background-image:linear-gradient(#080808,#080808) !important;}.ap-case-card{background:#121213 !important;background-color:#121213 !important;background-image:linear-gradient(#121213,#121213) !important;border-color:#342820 !important;}.ap-pill-text{color:#e4dbd2 !important;-webkit-text-fill-color:#e4dbd2 !important;}.ap-lead-text,.ap-hero,.ap-case-title,.ap-btn,.ap-btn-text{color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;}.ap-copy{color:#d8cec4 !important;-webkit-text-fill-color:#d8cec4 !important;}.ap-date-text{color:#a99f96 !important;-webkit-text-fill-color:#a99f96 !important;}.ap-date-value{color:#ddd4cc !important;-webkit-text-fill-color:#ddd4cc !important;}.ap-case-label,.ap-secondary-link,.ap-secondary-text{color:#f7c480 !important;-webkit-text-fill-color:#f7c480 !important;}.ap-footer-text{color:#bfb5ac !important;-webkit-text-fill-color:#bfb5ac !important;}.ap-footer-meta{color:#928a83 !important;-webkit-text-fill-color:#928a83 !important;}}'

  const outlookDarkCss =
    '[data-ogsc] body,[data-ogsc] .ap-bg,[data-ogsb] body,[data-ogsb] .ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;}[data-ogsc] .ap-card,[data-ogsb] .ap-card{background:#0b0b0d !important;background-color:#0b0b0d !important;background-image:linear-gradient(#0b0b0d,#0b0b0d) !important;}[data-ogsc] .ap-case-card,[data-ogsb] .ap-case-card{background:#121213 !important;background-color:#121213 !important;background-image:linear-gradient(#121213,#121213) !important;}[data-ogsc] .ap-lead-text,[data-ogsb] .ap-lead-text,[data-ogsc] .ap-case-title,[data-ogsb] .ap-case-title,[data-ogsc] .ap-btn,[data-ogsb] .ap-btn,[data-ogsc] .ap-btn-text,[data-ogsb] .ap-btn-text{color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;}[data-ogsc] .ap-copy,[data-ogsb] .ap-copy{color:#d8cec4 !important;-webkit-text-fill-color:#d8cec4 !important;}[data-ogsc] .ap-pill-text,[data-ogsb] .ap-pill-text{color:#e4dbd2 !important;-webkit-text-fill-color:#e4dbd2 !important;}[data-ogsc] .ap-case-label,[data-ogsb] .ap-case-label,[data-ogsc] .ap-secondary-link,[data-ogsb] .ap-secondary-link,[data-ogsc] .ap-secondary-text,[data-ogsb] .ap-secondary-text{color:#f7c480 !important;-webkit-text-fill-color:#f7c480 !important;}'

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="dark">',
    '<meta name="supported-color-schemes" content="dark">',
    '<title>New case assigned</title>',
    '<style>',
    "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');",
    mobileCss,
    mobileDarkCss,
    outlookDarkCss,
    'a.ap-btn:hover{background:#7c2c0a !important;}',
    '</style>',
    '</head>',
    `<body style="margin:0;padding:0;background:#000000;font-family:${fontStack};color:#ffffff;-webkit-text-size-adjust:100%;text-size-adjust:100%;color-scheme:dark;supported-color-schemes:dark;">`,
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A new case was assigned to you &mdash; open it in the Lawyer Portal.</div>',
    `<table class="ap-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#000000" background="${safeBgUrl}" style="background-color:#000000;background-image:linear-gradient(180deg,rgba(0,0,0,0.50),rgba(0,0,0,0.74)),url('${safeBgUrl}');background-position:center;background-size:cover;background-repeat:no-repeat;margin:0;padding:36px 12px;">`,
    '<tr>',
    '<td align="center">',
    '<table class="ap-card" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0b0d" style="width:100%;max-width:600px;background-color:rgba(11,11,13,0.84);border:1px solid rgba(255,255,255,0.08);border-radius:24px;overflow:hidden;">',
    '<tr>',
    `<td class="ap-pad ap-header" bgcolor="#080808" style="padding:30px 40px;background-color:#080808;background-image:radial-gradient(135% 150% at 80% 138%,rgba(247,196,128,0.30) 0%,rgba(174,64,16,0.15) 32%,rgba(8,8,9,0) 62%);border-bottom:1px solid rgba(255,255,255,0.07);">`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">',
    '<tr>',
    `<td class="ap-logo-cell" style="vertical-align:middle;"><img src="${safeLogoUrl}" width="150" alt="Accident Payments" style="display:block;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;"></td>`,
    `<td class="ap-pill-cell" align="right" style="vertical-align:middle;white-space:nowrap;"><span class="ap-pill" style="display:inline-block;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:6px 13px;font-size:12px;font-weight:600;font-family:${fontStack};"><span class="ap-pill-dot" style="color:#f7c480;-webkit-text-fill-color:#f7c480;">&bull;</span>&nbsp;<span class="ap-pill-text" style="color:rgba(255,255,255,0.82);-webkit-text-fill-color:#dcd3ca;">Lawyer Portal</span></span></td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad ap-lead" style="padding:40px 40px 0 40px;"><p class="ap-lead-text" style="margin:0;color:rgba(255,255,255,0.92);-webkit-text-fill-color:#f7f1eb;font-size:18px;line-height:1.5;font-weight:600;font-family:${fontStack};">You've been assigned a new case.</p></td>`,
    '</tr>',
    '<tr>',
    '<td class="ap-pad" style="padding:20px 40px 0 40px;">',
    '<table class="ap-case-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#121213" style="background:#121213;border:1px solid rgba(255,255,255,0.10);border-radius:16px;">',
    '<tr>',
    '<td width="4" style="width:4px;background:#f7c480;font-size:0;line-height:0;">&nbsp;</td>',
    '<td style="padding:22px 24px;">',
    `<p class="ap-case-label" style="margin:0 0 10px 0;color:#f7c480;-webkit-text-fill-color:#f7c480;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;font-family:${fontStack};">Case</p>`,
    `<p class="ap-hero ap-case-title" style="margin:0;color:#ffffff;-webkit-text-fill-color:#ffffff;font-size:30px;line-height:1.18;font-weight:700;letter-spacing:0;font-family:${fontStack};">${safeCaseName}</p>`,
    addedLine,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad" style="padding:22px 40px 0 40px;"><p class="ap-copy" style="margin:0;color:rgba(255,255,255,0.6);-webkit-text-fill-color:#d8cec4;font-size:15px;line-height:1.65;font-family:${fontStack};">${safeBody}</p></td>`,
    '</tr>',
    '<tr>',
    '<td class="ap-pad" style="padding:30px 40px 36px 40px;">',
    '<table class="ap-actions" role="presentation" cellspacing="0" cellpadding="0" border="0">',
    '<tr>',
    `<td class="ap-btn-cell" style="border-radius:14px;background:#ae4010;box-shadow:0 12px 28px rgba(174,64,16,0.40);"><a class="ap-btn" href="${safePortalUrl}" style="display:inline-block;padding:15px 26px;color:#ffffff;-webkit-text-fill-color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;line-height:1;font-family:${fontStack};border-radius:14px;"><span class="ap-btn-text" style="color:#ffffff;-webkit-text-fill-color:#ffffff;">Open case</span></a></td>`,
    `<td class="ap-secondary-cell" style="padding-left:8px;"><a class="ap-secondary-link" href="${safeNotificationsUrl}" style="display:inline-block;padding:15px 16px;color:#f7c480;-webkit-text-fill-color:#f7c480;text-decoration:none;font-size:14px;font-weight:600;line-height:1;font-family:${fontStack};"><span class="ap-secondary-text" style="color:#f7c480;-webkit-text-fill-color:#f7c480;">View all notifications</span></a></td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad ap-footer" bgcolor="#080808" style="padding:22px 40px 26px 40px;background-color:#080808;background-image:radial-gradient(140% 170% at 20% 150%,rgba(247,196,128,0.22) 0%,rgba(174,64,16,0.12) 34%,rgba(8,8,9,0) 60%);border-top:1px solid rgba(255,255,255,0.07);">`,
    `<p class="ap-footer-text" style="margin:0 0 6px 0;color:#7c746d;-webkit-text-fill-color:#bfb5ac;font-size:12px;line-height:1.6;font-family:${fontStack};">You're getting this because a case was assigned to your Lawyer Portal account. If that doesn't look right, contact your administrator.</p>`,
    `<p class="ap-footer-meta" style="margin:0;color:#5f5853;-webkit-text-fill-color:#928a83;font-size:12px;line-height:1.6;font-family:${fontStack};">&copy; ${year} Accident Payments &middot; Lawyer Portal</p>`,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>'
  ].join('')

  return { subject, text, html }
}

const isBlankValue = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

const humanizeKey = (key) =>
  String(key ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())

const formatDateLikeValue = (value) => {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const hasTime = /T|\s\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(hasTime
      ? {
          hour: '2-digit',
          minute: '2-digit'
        }
      : {})
  }).format(date)
}

const maskIdentifier = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const visible = raw.replace(/\D/g, '').slice(-4) || raw.slice(-4)
  return visible ? `***-**-${visible}` : '***'
}

const formatLeadValue = (key, value) => {
  if (key === 'social_security' || key === 'driver_license') {
    return maskIdentifier(value)
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.join(', ')

  const dateValue = formatDateLikeValue(value)
  if (dateValue) return dateValue

  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value ?? '')
}

const leadFieldGroups = [
  {
    title: 'Client Details',
    fields: [
      'customer_full_name',
      'phone_number',
      'alternate_phone',
      'can_receive_texts',
      'email',
      'date_of_birth',
      'age',
      'birth_state',
      'social_security',
      'driver_license'
    ]
  },
  {
    title: 'Address',
    fields: ['street_address', 'city', 'state', 'zip_code']
  },
  {
    title: 'Accident Details',
    fields: [
      'accident_date',
      'accident_location',
      'accident_scenario',
      'was_client_driver',
      'accident_last_12_months',
      'is_lead_at_fault',
      'other_party_admit_fault',
      'police_attended',
      'passengers_count'
    ]
  },
  {
    title: 'Medical And Injury Details',
    fields: [
      'is_injured',
      'injuries',
      'medical_attention',
      'received_medical_treatment',
      'health_conditions',
      'medical_treatment_proof'
    ]
  },
  {
    title: 'Representation And Insurance',
    fields: [
      'prior_attorney_involved',
      'prior_attorney_details',
      'currently_represented',
      'signed_contract_with_attorney',
      'insured',
      'insurance_company',
      'vehicle_registration',
      'third_party_vehicle_registration',
      'insurance_documents',
      'police_report'
    ]
  },
  {
    title: 'Alternate Contact And Notes',
    fields: ['contact_name', 'contact_number', 'contact_address', 'additional_notes']
  }
]

const buildLeadDetailSections = (lead) =>
  leadFieldGroups
    .map((group) => {
      const rows = group.fields
        .filter((key) => !isBlankValue(lead?.[key]))
        .map((key) => ({
          label: humanizeKey(key),
          value: formatLeadValue(key, lead[key])
        }))

      return rows.length ? { title: group.title, rows } : null
    })
    .filter(Boolean)

const renderDetailRows = (rows, fontStack) =>
  rows
    .map((row) => (
      '<tr>'
      + `<td style="padding:9px 12px;border-top:1px solid rgba(255,255,255,0.07);color:#9f958c;-webkit-text-fill-color:#9f958c;font-size:12px;line-height:1.45;font-family:${fontStack};vertical-align:top;width:38%;">${escapeHtml(row.label)}</td>`
      + `<td style="padding:9px 12px;border-top:1px solid rgba(255,255,255,0.07);color:#f4eee8;-webkit-text-fill-color:#f4eee8;font-size:13px;line-height:1.45;font-family:${fontStack};vertical-align:top;word-break:break-word;">${escapeHtml(row.value)}</td>`
      + '</tr>'
    ))
    .join('')

const renderDetailSections = (sections, fontStack) =>
  sections
    .map((section) => (
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#121213" style="margin:0 0 14px 0;background:#121213;border:1px solid rgba(255,255,255,0.10);border-radius:14px;overflow:hidden;">'
      + '<tr>'
      + `<td colspan="2" style="padding:13px 12px;color:#f7c480;-webkit-text-fill-color:#f7c480;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;font-family:${fontStack};">${escapeHtml(section.title)}</td>`
      + '</tr>'
      + renderDetailRows(section.rows, fontStack)
      + '</table>'
    ))
    .join('')

const buildTextDetailSections = (sections) =>
  sections
    .flatMap((section) => [
      section.title,
      ...section.rows.map(row => `${row.label}: ${row.value}`),
      ''
    ])
    .join('\n')
    .trim()

export const buildBeliefBrokerRetainerEmailContent = (context, options) => {
  const appBaseUrl = normalizeBaseUrl(options?.appBaseUrl)
  const delivery = context?.delivery ?? {}
  const lead = context?.lead ?? {}
  const broker = context?.broker ?? {}
  const attorney = context?.attorney ?? {}
  const document = context?.document ?? {}
  const logoUrl = options?.logoUrl?.trim() || getPublicAssetUrl(appBaseUrl, '/assets/logo.svg')
  const bgUrl = options?.backgroundUrl?.trim() || getPublicAssetUrl(appBaseUrl, '/assets/email.jpg')
  const caseName = String(lead.customer_full_name || delivery.lead_name || 'Unknown Client').trim()
  const attorneyName = String(attorney.attorney_name || 'Assigned broker attorney').trim()
  const brokerName = String(broker.full_name || broker.company_name || 'Belief Marketing').trim()
  const assignedDate = formatAssignedDate(delivery.delivery_created_at || delivery.created_at || lead.updated_at || lead.created_at)
  const sections = buildLeadDetailSections(lead)
  const sectionHtml = renderDetailSections(sections, "'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif")
  const detailText = buildTextDetailSections(sections)
  const year = new Date().getFullYear()
  const fontStack = "'Montserrat','Helvetica Neue',Helvetica,Arial,sans-serif"

  const safeCaseName = escapeHtml(caseName)
  const safeAttorneyName = escapeHtml(attorneyName)
  const safeBrokerName = escapeHtml(brokerName)
  const safeLogoUrl = escapeHtml(logoUrl)
  const safeBgUrl = escapeHtml(bgUrl)
  const safeDocumentName = escapeHtml(document.file_name || 'Signed retainer document')
  const safeAssignedDate = assignedDate ? escapeHtml(assignedDate) : null
  const subject = `New signed retainer assigned: ${caseName}`

  const text = [
    `A new signed retainer was assigned to ${attorneyName}.`,
    '',
    `Broker: ${brokerName}`,
    `Client: ${caseName}`,
    assignedDate ? `Assigned: ${assignedDate}` : null,
    `Attached document: ${document.file_name || 'Signed retainer document'}`,
    '',
    'Lead details',
    detailText,
    '',
    'SSN and driver license values are masked in this email body. The signed retainer is attached.',
    '',
    `Copyright ${year} Accident Payments`
  ]
    .filter((line) => line !== null)
    .join('\n')

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="dark">',
    '<meta name="supported-color-schemes" content="dark">',
    '<title>New signed retainer assigned</title>',
    '<style>',
    "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');",
    '@media (max-width:620px){body,.ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;padding:18px 10px !important;}.ap-card{border-radius:18px !important;}.ap-pad{padding-left:22px !important;padding-right:22px !important;}.ap-logo-cell,.ap-pill-cell{display:block !important;width:100% !important;text-align:left !important;}.ap-pill-cell{padding-top:14px !important;}.ap-title{font-size:25px !important;line-height:1.2 !important;}}',
    '</style>',
    '</head>',
    `<body style="margin:0;padding:0;background:#000000;font-family:${fontStack};color:#ffffff;-webkit-text-size-adjust:100%;text-size-adjust:100%;color-scheme:dark;supported-color-schemes:dark;">`,
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A new signed retainer was assigned to one of your attorneys.</div>',
    `<table class="ap-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#000000" background="${safeBgUrl}" style="background-color:#000000;background-image:linear-gradient(180deg,rgba(0,0,0,0.50),rgba(0,0,0,0.78)),url('${safeBgUrl}');background-position:center;background-size:cover;background-repeat:no-repeat;margin:0;padding:36px 12px;">`,
    '<tr>',
    '<td align="center">',
    '<table class="ap-card" role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b0b0d" style="width:100%;max-width:680px;background-color:rgba(11,11,13,0.88);border:1px solid rgba(255,255,255,0.08);border-radius:24px;overflow:hidden;">',
    '<tr>',
    `<td class="ap-pad" bgcolor="#080808" style="padding:30px 40px;background-color:#080808;background-image:radial-gradient(135% 150% at 80% 138%,rgba(247,196,128,0.30) 0%,rgba(174,64,16,0.15) 32%,rgba(8,8,9,0) 62%);border-bottom:1px solid rgba(255,255,255,0.07);">`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">',
    '<tr>',
    `<td class="ap-logo-cell" style="vertical-align:middle;"><img src="${safeLogoUrl}" width="150" alt="Accident Payments" style="display:block;max-width:150px;height:auto;border:0;outline:none;text-decoration:none;"></td>`,
    `<td class="ap-pill-cell" align="right" style="vertical-align:middle;white-space:nowrap;"><span style="display:inline-block;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:6px 13px;font-size:12px;font-weight:600;font-family:${fontStack};"><span style="color:#f7c480;-webkit-text-fill-color:#f7c480;">&bull;</span>&nbsp;<span style="color:#e4dbd2;-webkit-text-fill-color:#e4dbd2;">Broker Notice</span></span></td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad" style="padding:38px 40px 0 40px;"><p style="margin:0;color:#f7f1eb;-webkit-text-fill-color:#f7f1eb;font-size:18px;line-height:1.5;font-weight:600;font-family:${fontStack};">A new signed retainer was assigned to your attorney.</p></td>`,
    '</tr>',
    '<tr>',
    '<td class="ap-pad" style="padding:20px 40px 0 40px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#121213" style="background:#121213;border:1px solid rgba(255,255,255,0.10);border-radius:16px;overflow:hidden;">',
    '<tr>',
    '<td width="4" style="width:4px;background:#f7c480;font-size:0;line-height:0;">&nbsp;</td>',
    '<td style="padding:22px 24px;">',
    `<p style="margin:0 0 10px 0;color:#f7c480;-webkit-text-fill-color:#f7c480;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;font-family:${fontStack};">Client</p>`,
    `<p class="ap-title" style="margin:0;color:#ffffff;-webkit-text-fill-color:#ffffff;font-size:30px;line-height:1.18;font-weight:700;letter-spacing:0;font-family:${fontStack};">${safeCaseName}</p>`,
    `<div style="height:1px;line-height:1px;font-size:1px;background:rgba(255,255,255,0.08);margin:16px 0 14px 0;">&nbsp;</div>`,
    `<p style="margin:0;color:#cfc4ba;-webkit-text-fill-color:#cfc4ba;font-size:13px;line-height:1.6;font-family:${fontStack};">Attorney: ${safeAttorneyName}</p>`,
    `<p style="margin:4px 0 0 0;color:#cfc4ba;-webkit-text-fill-color:#cfc4ba;font-size:13px;line-height:1.6;font-family:${fontStack};">Broker: ${safeBrokerName}</p>`,
    safeAssignedDate ? `<p style="margin:4px 0 0 0;color:#cfc4ba;-webkit-text-fill-color:#cfc4ba;font-size:13px;line-height:1.6;font-family:${fontStack};">Assigned: ${safeAssignedDate}</p>` : '',
    `<p style="margin:4px 0 0 0;color:#cfc4ba;-webkit-text-fill-color:#cfc4ba;font-size:13px;line-height:1.6;font-family:${fontStack};">Attachment: ${safeDocumentName}</p>`,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad" style="padding:22px 40px 0 40px;"><p style="margin:0;color:#d8cec4;-webkit-text-fill-color:#d8cec4;font-size:15px;line-height:1.65;font-family:${fontStack};">The signed retainer is attached. SSN and driver license values are masked in the email body.</p></td>`,
    '</tr>',
    '<tr>',
    `<td class="ap-pad" style="padding:22px 40px 0 40px;">${sectionHtml}</td>`,
    '</tr>',
    '<tr>',
    `<td class="ap-pad" bgcolor="#080808" style="padding:22px 40px 26px 40px;background-color:#080808;background-image:radial-gradient(140% 170% at 20% 150%,rgba(247,196,128,0.22) 0%,rgba(174,64,16,0.12) 34%,rgba(8,8,9,0) 60%);border-top:1px solid rgba(255,255,255,0.07);">`,
    `<p style="margin:0 0 6px 0;color:#bfb5ac;-webkit-text-fill-color:#bfb5ac;font-size:12px;line-height:1.6;font-family:${fontStack};">You're getting this because a case was sent to one of Belief Marketing's broker attorneys.</p>`,
    `<p style="margin:0;color:#928a83;-webkit-text-fill-color:#928a83;font-size:12px;line-height:1.6;font-family:${fontStack};">&copy; ${year} Accident Payments &middot; Broker Portal</p>`,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>'
  ].join('')

  return { subject, text, html }
}
