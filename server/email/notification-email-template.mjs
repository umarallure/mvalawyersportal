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
  const assignedDate = formatAssignedDate(delivery.created_at)
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
      + `<p style="margin:0;color:#8f8780;font-size:13px;line-height:1.5;font-family:${fontStack};">Added <span style="color:#cfc4ba;">${escapeHtml(assignedDate)}</span></p>`
    : ''

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
    '@media (max-width:620px){body,.ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;padding:18px 10px !important;}.ap-card{background:#0b0b0d !important;background-color:#0b0b0d !important;background-image:linear-gradient(#0b0b0d,#0b0b0d) !important;border-color:#27201a !important;border-radius:18px !important;}.ap-pad{padding-left:22px !important;padding-right:22px !important;}.ap-header{background:#080808 !important;background-color:#080808 !important;background-image:linear-gradient(#080808,#080808) !important;padding-top:24px !important;padding-bottom:22px !important;}.ap-logo-cell,.ap-pill-cell{display:block !important;width:100% !important;text-align:left !important;}.ap-pill-cell{padding-top:14px !important;}.ap-pill{background:#111113 !important;background-color:#111113 !important;background-image:linear-gradient(#111113,#111113) !important;border-color:#342a20 !important;}.ap-lead{padding-top:30px !important;}.ap-hero{font-size:25px !important;line-height:1.2 !important;color:#ffffff !important;}.ap-case-card{background:#121213 !important;background-color:#121213 !important;background-image:linear-gradient(#121213,#121213) !important;border-color:#322922 !important;}.ap-copy{color:#d6cbc0 !important;}.ap-btn-cell{display:block !important;width:100% !important;background-image:linear-gradient(#ae4010,#ae4010) !important;}.ap-btn{display:block !important;text-align:center !important;color:#ffffff !important;}.ap-secondary{display:block !important;margin:16px 0 0 0 !important;padding-left:0 !important;text-align:center !important;color:#f7c480 !important;}.ap-footer{background:#080808 !important;background-color:#080808 !important;background-image:linear-gradient(#080808,#080808) !important;}}',
    '@media (max-width:620px) and (prefers-color-scheme:dark){body,.ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;}.ap-card{background:#0b0b0d !important;background-color:#0b0b0d !important;background-image:linear-gradient(#0b0b0d,#0b0b0d) !important;}.ap-header,.ap-footer{background:#080808 !important;background-color:#080808 !important;background-image:linear-gradient(#080808,#080808) !important;}.ap-case-card{background:#121213 !important;background-color:#121213 !important;background-image:linear-gradient(#121213,#121213) !important;}}',
    '[data-ogsc] body,[data-ogsc] .ap-bg,[data-ogsb] body,[data-ogsb] .ap-bg{background:#050505 !important;background-color:#050505 !important;background-image:linear-gradient(#050505,#050505) !important;}[data-ogsc] .ap-card,[data-ogsb] .ap-card{background:#0b0b0d !important;background-color:#0b0b0d !important;background-image:linear-gradient(#0b0b0d,#0b0b0d) !important;}[data-ogsc] .ap-case-card,[data-ogsb] .ap-case-card{background:#121213 !important;background-color:#121213 !important;background-image:linear-gradient(#121213,#121213) !important;}',
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
    `<td class="ap-pill-cell" align="right" style="vertical-align:middle;white-space:nowrap;"><span class="ap-pill" style="display:inline-block;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:6px 13px;font-size:12px;font-weight:600;font-family:${fontStack};"><span style="color:#f7c480;">&bull;</span>&nbsp;<span style="color:rgba(255,255,255,0.82);">Lawyer Portal</span></span></td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad ap-lead" style="padding:40px 40px 0 40px;"><p style="margin:0;color:rgba(255,255,255,0.92);font-size:18px;line-height:1.5;font-weight:600;font-family:${fontStack};">You've been assigned a new case.</p></td>`,
    '</tr>',
    '<tr>',
    '<td class="ap-pad" style="padding:20px 40px 0 40px;">',
    '<table class="ap-case-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#121213" style="background:#121213;border:1px solid rgba(255,255,255,0.10);border-radius:16px;">',
    '<tr>',
    '<td width="4" style="width:4px;background:#f7c480;font-size:0;line-height:0;">&nbsp;</td>',
    '<td style="padding:22px 24px;">',
    `<p style="margin:0 0 10px 0;color:#f7c480;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;font-family:${fontStack};">Case</p>`,
    `<p class="ap-hero" style="margin:0;color:#ffffff;font-size:30px;line-height:1.18;font-weight:700;letter-spacing:0;font-family:${fontStack};">${safeCaseName}</p>`,
    addedLine,
    '</td>',
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad" style="padding:22px 40px 0 40px;"><p class="ap-copy" style="margin:0;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.65;font-family:${fontStack};">${safeBody}</p></td>`,
    '</tr>',
    '<tr>',
    '<td class="ap-pad" style="padding:30px 40px 36px 40px;">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0">',
    '<tr>',
    `<td class="ap-btn-cell" style="border-radius:14px;background:#ae4010;box-shadow:0 12px 28px rgba(174,64,16,0.40);"><a class="ap-btn" href="${safePortalUrl}" style="display:inline-block;padding:15px 26px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;line-height:1;font-family:${fontStack};border-radius:14px;">Open case</a></td>`,
    `<td class="ap-secondary" style="padding-left:8px;"><a class="ap-secondary" href="${safeNotificationsUrl}" style="display:inline-block;padding:15px 16px;color:#f7c480;text-decoration:none;font-size:14px;font-weight:600;line-height:1;font-family:${fontStack};">View all notifications</a></td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '<tr>',
    `<td class="ap-pad ap-footer" bgcolor="#080808" style="padding:22px 40px 26px 40px;background-color:#080808;background-image:radial-gradient(140% 170% at 20% 150%,rgba(247,196,128,0.22) 0%,rgba(174,64,16,0.12) 34%,rgba(8,8,9,0) 60%);border-top:1px solid rgba(255,255,255,0.07);">`,
    `<p style="margin:0 0 6px 0;color:#7c746d;font-size:12px;line-height:1.6;font-family:${fontStack};">You're getting this because a case was assigned to your Lawyer Portal account. If that doesn't look right, contact your administrator.</p>`,
    `<p style="margin:0;color:#5f5853;font-size:12px;line-height:1.6;font-family:${fontStack};">&copy; ${year} Accident Payments &middot; Lawyer Portal</p>`,
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
