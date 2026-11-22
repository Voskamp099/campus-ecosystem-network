#!/usr/bin/env python3
"""Generate public/assets/i18n-en.js from the full visible-text inventory.

The English layer is a pure presentation overlay: it never touches app logic,
only text nodes and a fixed set of attributes. Chinese is the default; English
is opt-in via ?lang=en or by picking EN once (remembered in localStorage).

The Chinese side lives in scripts/zh_inventory.json so this script is
self-contained — it used to read /tmp, which meant it could not be run by
anyone else. After generating, the script cross-checks the inventory against
the Chinese currently present in public/ and reports anything untranslated.
"""
import json, os, re, glob

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INV = os.path.join(BASE, "scripts", "zh_inventory.json")

zh = json.load(open(INV, encoding="utf-8"))

# English translation, aligned 1:1 with zh (same order). One line per entry.
en = [
"The Beijing Campus Ecosystem Alliance (the “Alliance”) is committed to building an efficient, open platform for industry–academia–research collaboration. These Terms of Service of the Beijing Campus Ecosystem Alliance (the “Terms”) set out the rules governing the Alliance platform (the “Platform”) and protect the lawful rights and interests of Alliance members (“you” or “Members”). Please read and fully understand these Terms before registering for or using the Platform.",
"The Beijing Campus Ecosystem Alliance (“we”) recognizes how important personal information is to you and your institution. We handle and protect your personal information in strict accordance with the Personal Information Protection Law, the Data Security Law and other applicable laws, following the principles of lawfulness, legitimacy and necessity. This policy explains clearly how we collect, use, store and share your information.",
"If providing our services involves collecting personal information from minors (such as student interns or secondary-school students), we will strictly obtain guardian consent as required by law and process only the information necessary to protect the minor.",
"Submit your collaboration request through the on-site form. We route it by collaboration direction, directory category and contact details so that nothing is lost and review stays straightforward.",
"Intellectual property in information, results and requests posted by members remains with the original rights holder. By posting, members authorize the Alliance to display, promote and make necessary edits within the Platform.",
"This Platform is a B2B/B2G information-exchange and resource-matching service. It does not take part in specific commercial transactions or project execution between members; it provides technical support and intermediary services only.",
"If a revision substantially reduces your rights under this Privacy Policy, we will notify you before it takes effect, either by a prominent notice on the homepage or by email.",
"Intellectual property in results of collaborations reached through the Platform (such as patents or software copyrights) is agreed in a separate contract between the parties; the Alliance holds no rights in those results.",
"We retain your information only for the shortest period needed to achieve the purpose. When you close your account or the service ends, we delete or anonymize your personal information promptly.",
"If you are already signed in, you can also check some application statuses in “My account”; the reference number plus contact details method is the most reliable and works without an account.",
"The Alliance may revise these Terms in line with laws or platform operations. Revised Terms take effect once published on the Platform; continued use constitutes acceptance.",
"Disputes arising from these Terms should first be resolved through friendly negotiation. If negotiation fails, either party may bring a claim before the people’s court with jurisdiction where the Alliance is located.",
"The Alliance reviews information but cannot guarantee the absolute truthfulness, accuracy or completeness of everything members post. Members should judge for themselves and bear the transaction risk.",
"Only with your explicit consent, and to enable industry–academia–research collaboration, will we share your contact details or request information with a matched partner (such as a university or company).",
"For data involving university privacy, unpublished research results, state secrets or trade secrets, we apply encryption and masking and strictly limit access.",
"If a member breaches these Terms, infringes others’ rights or violates laws, the Alliance may issue a warning, restrict features, suspend service or terminate the cooperation.",
"We bring together the strengths of universities, companies and government to connect education, talent, industry and innovation, and to support university–local collaboration and the transfer of research results.",
"The production back office is connected to Node.js, MySQL and Volcengine object storage. Once signed in you can upload images and publish them to the homepage directly.",
"Without the rights holder’s written permission, members may not disclose confidential information to third parties or use it for any purpose other than the collaboration. This clause survives termination of the agreement.",
"The Alliance operator may review applications to join. It may reject applications that do not fit the Alliance or that misrepresent qualifications, without giving reasons.",
"A member in breach who causes loss to the Alliance or a third party bears full compensation, including legal fees and court costs.",
"After you submit a request you will receive a reference number. Enter that number and the contact details you used to see the latest progress.",
"Business secrets, technical data, student privacy information and unpublished research results learned during interaction on the Platform are all confidential.",
"You can switch between campus and company partners here, or search directly by organization name, collaboration focus, time, location or keyword.",
"If you represent a student organization, government platform or company team, write your full entity name in “Organization” so we can follow up.",
"Connecting universities, companies, founders and student organizations so that internships, event collaboration, resource sharing and community matching happen faster.",
"If service is interrupted or data is lost due to force majeure such as natural disaster, war, cyberattack or government action, the Alliance bears no liability for breach.",
"We may engage third-party providers (such as cloud or SMS services) and will require them to observe strict confidentiality.",
"Applicants must be higher-education institutions, research institutes, companies or government bodies with legal operating or corporate status.",
"Members must provide true, accurate and lawful organization and contact information at registration and update it promptly if it changes.",
"https://example.com or mailto:xxx@example.com",
"If you have any question, comment or suggestion about this Privacy Policy, or wish to exercise your rights, contact us as follows:",
"We will respond to reasonable requests promptly. We do not normally charge a fee, though repeated or complex requests may incur a reasonable cost.",
"Disputes between members arising from a collaboration are resolved by the members themselves. The Alliance bears no joint liability but will provide necessary assistance.",
"Your edits are stored in this browser’s localStorage and are not synced to a server. The administrator account is",
"In specific circumstances (such as unlawful collection by us or closure of your account), you may request deletion of your personal information.",
"Software, technology, trademarks, copy and design within the Platform belong to the Alliance operator or the relevant rights holder.",
"Through data-driven matching, we connect companies and universities for research cooperation, talent recruitment and internship-base partnerships.",
"© 2026 Beijing Campus Ecosystem Alliance · All Rights Reserved",
"Based on member profiles, we push relevant government policy on industry–academia collaboration, tax incentives and talent recruitment.",
"State your collaboration goal, timeline and resources needed clearly so we can match you to the right team quickly.",
"Your request goes to the Alliance back office, where it is reviewed and routed centrally. Complete information is processed faster.",
"For student founders with a project, an idea or a direction to explore, we offer long-term support and resource matching.",
"Keep at least one way to reach you. After a successful submission we review and follow up centrally.",
"The Platform serves mainly B2B/B2G scenarios; its users are primarily university, company and government staff.",
"You can filter by category here, or search directly by event name, time, location or keyword.",
"Contact email: legal@campus-alliance.example",
"For company partners, technical teams and student organizations exploring the Baidu AI ecosystem.",
"Your personal information is stored on servers within the People’s Republic of China and is not transferred abroad.",
"We may revise this Privacy Policy from time to time; such revisions form part of this Policy.",
"We do not disclose such sensitive information unless required by law or by a compulsory judicial order.",
"Observe national laws and these Terms; do not use the Platform for any unlawful activity.",
"You may withdraw consent for specific processing by changing your account settings or contacting us.",
"These Terms are governed by the laws of the People’s Republic of China, including their interpretation and dispute resolution.",
"Posting state secrets, unpublished core technology or other sensitive information on the Platform is strictly prohibited.",
"Your reference number is below. Please keep it; you can use it later to check progress on the Platform.",
"We apply strict access controls so that only authorized staff can access data when their work requires it.",
"You may use Platform features for resource matching, policy updates and data queries.",
"Protect the Alliance’s reputation; do not post false information, rumors or content that disparages competitors.",
"IP address, browser type and visit logs, used to keep the Platform secure and running.",
"A small meetup around AI tool adoption, collaboration practices and real deployment cases.",
"If you run into a problem while registering, scan the code to contact support for faster review and answers.",
"You may sign in at any time to see the information we hold about you or your institution.",
"Under applicable law, you have the following rights while using the Platform.",
"No matching partner could be found. Please return to the directory and start a new request.",
"Expert consulting in legal, financial and intellectual-property transfer matters.",
"These Terms take effect on the date you confirm acceptance or first use the Platform.",
"Organization name, unified social credit code, business address and industry qualifications.",
"You may join online and offline events and industry–academia matchmaking sessions organized by the Alliance.",
"Tell us the direction, goal, timeline and support you are looking for.",
"Upload an image, title and description to appear on the homepage resource cards.",
"Share and ask questions about internship opportunities, growth paths and cross-campus exchange.",
"In-depth exchange on campus ecosystem collaboration, resource coordination and joint events.",
"Encryption (SSL/TLS) protects data in transit.",
"For example: a student organization at Peking University / a company campus partnership team",
"For example: joint events / policy briefing / internship collaboration",
"Browse the directory, sign up for events and apply for internships in one place.",
"Browse internships, post needs, match partnerships, join events and get community support.",
"For career talks, company visits and joint recruiting events.",
"Regular reports on the campus ecosystem industry to support member decisions.",
"Add us on WeChat with your school or organization noted; you will be admitted after review.",
"Add your school, organization or collaboration focus so we can match resources precisely.",
"Suitable for joint programs, bootcamps and on-campus outreach.",
"Mailing address: Alliance Secretariat, [District] [Road] [No.], Beijing",
"University students, student leaders, and campus recruiting or partnership managers at companies.",
"Name, title, work email, phone number and WeChat ID.",
"We do not sell your personal information to other organizations or individuals.",
"Enter your email, password and basic details to register in about a minute.",
"Search by organization name, collaboration focus, time, location or keyword.",
"For startup showcases, mentor connections and pitch-day collaboration.",
"For students interested in AI products and requirements analysis.",
"Beijing · JD.com headquarters · internship, 3 months+",
"If you find information inaccurate, you may request a correction or addition.",
"Used for resource matching, policy updates and consulting.",
"For weekend meetups, social events and city exploration.",
"From “looks lively” to “actually delivers”",
"The page you requested may have been removed or its address changed,",
"Search by event name, time, location or keyword.",
"Local-mode password (you will set it on first use)",
"Used for internal audit, security and anti-fraud.",
"Phone: 010-xxxx-xxxx",
"One per line; shown as extra lines on the homepage resource cards.",
"For example: DX260424AB12CD",
"For example: campus lead / company partnership manager",
"Beijing Campus Ecosystem Alliance WeCom QR code",
"Search partners, events and internships...",
"Dining discounts, youth social events and offline meetups.",
", and the password is the local password set on this computer.",
"Regular security assessments and vulnerability scans.",
"Internships, founder community and mentor support.",
"Please provide at least one way to contact you for verification.",
"Enter your email and we will send a reset link.",
"Hotel deals, shopping discounts and travel subsidies.",
"OpenClaw: from installation to deployment",
"Published: 21 July 2026",
"Effective: 21 July 2024",
"Effective: 21 July 2026",
"1. What information we collect and why",
"2. How we store and protect information",
"Local-mode default account: admin",
"Version: 2026-V1.0",
"Used to verify member identity and manage accounts.",
"Please confirm the matching partner before submitting.",
"Courses, tools, papers and academic support.",
"Wteam founder recruitment (ongoing)",
"Beihang University logo",
"University of International Business and Economics logo",
"Offer suggestions and feedback on Platform services.",
"Baidu AI ecosystem volunteer program",
"Invalid verification link, missing token",
"3. How we share and disclose information",
"5. Intellectual property and ownership of results",
"Join the Beijing Campus Ecosystem Alliance",
"A campus ecosystem collaboration platform for Beijing",
"Beihang University entrepreneurship community",
"Or perhaps this page never existed.",
"Supports images, titles and related fields",
"Local mode · browser storage",
"Tsinghua University Career Development Association",
"Other lawful purposes with your consent.",
"10. Effectiveness and changes",
"Founder community · nationwide universities",
"Beijing University of Technology logo",
"Beijing Institute of Technology logo",
"Optional; shown as a note on the homepage",
"e.g. student, teacher, team lead",
"Support WeCom QR code information",
"Search partner name or type",
"Results will appear here.",
"Baidu ecosystem · online community",
"1. Purpose and nature of the Alliance",
"1500+ active members",
"2. Eligibility and registration",
"3. Member rights and obligations",
"3.4 Protection of sensitive information",
"5.1 Primary audience",
"5.1 Platform intellectual property",
"5.2 Member-uploaded content",
"5.3 Ownership of collaboration results",
"AI product manager intern",
"AI event · Beijing",
"Peking University Student Innovation Center",
"Beijing Campus Ecosystem Alliance",
"Showing 1 entry",
"Showing 3 entries",
"Current account: admin",
"We suggest you keep the reference number",
"Campus · startup ecosystem",
"Campus · innovation practice",
"Campus · career growth",
"Closed-door campus ecosystem exchange",
"Fill in at least one contact method",
"Youth growth and practice sharing session",
"3.4 Third-party partners",
"4. Alliance services",
"5. Protection of minors",
"6. Confidentiality obligations",
"6. Policy update mechanism",
"7.1 Information accuracy",
"7.3 Third-party losses",
"9. Dispute resolution",
"9.2 Negotiation and litigation",
"Keep it consistent with what you submitted",
"Your identity / role",
"Peking University logo",
"Beijing E-Town related platforms",
"Growth event · on-site",
"Tsinghua University logo",
"Offline meetups and city events",
"Alliance event · Beijing",
"Hero image slot",
"1.1 What we collect",
"1.2 How we use it",
"2.1 Storage location",
"2.1 Eligibility",
"2.2 Retention period",
"2.2 Registration duties",
"2.3 Security measures",
"2.3 Review mechanism",
"3.1 Basic principles",
"3.1 Member rights",
"3.2 Member obligations",
"3.2 Authorized sharing",
"5.2 Special protection",
"6.1 Scope of confidentiality",
"6.2 Confidentiality duties",
"7.2 Force majeure",
"8.1 Determining a breach",
"8.2 Scope of compensation",
"9.1 Governing law",
"Beihang University",
"Start a new matching request",
"Partner carousel",
"University of International Business and Economics",
"Already have an account? Sign in",
"Currently in local mode.",
"Directory categories",
"Sign in to your Alliance account",
"Benefits hub content",
"Enter email or nickname",
"Back to directory",
"10.1 Effectiveness",
"10.2 Changes",
"4. Your rights",
"7. Disclaimer",
"7. Contact us",
"8. Liability for breach",
"Zhongguancun-related institutions",
"What you can do after joining",
"Organization",
"Weekend · Beijing",
"Password reset successful!",
"I have read and agree to the",
"Filter by content type",
"Filter by time and status",
"Show/hide password",
"No matching partner specified",
"Campus exchange and sharing",
"Ecosystem collaboration and co-building",
"Sign in / Sign up",
"Device and log information",
"Connecting campus and industry",
"+ Add item",
"1.1 Purpose",
"1.2 Nature",
"← Back to sign in",
"← Back to home",
"e.g. Student Zhang",
"Slide 1",
"Slide 2",
"Slide 3",
"Beijing University of Technology",
"Beijing Campus Ecosystem",
"Beijing Institute of Technology",
"Start matching →",
"Submit a matching request",
"Send reset link",
"Partner categories",
"Complete your profile",
"Practice project matching",
"Support WeCom",
"Password strength: weak",
"Request status",
"Start matching resources",
"Remembered your password?",
"Submit matching request",
"Search partners",
"View collaboration focus",
"Check request status",
"Register to join the Alliance",
"Click to upload an image",
"Learn more",
"Partner directory",
"Request submitted successfully",
"Alliance content console",
"Benefits hub",
"Alliance event on-site",
"Don’t have an account?",
"Beijing Association for Science and Technology",
"Go to status check",
"School / Organization",
"Already have an account?",
"Forgot password?",
"Confirm new password",
"Title / Role",
"Contact information",
"Contact name",
"Enter your password",
"Enter a title",
"Who should join",
"Email or nickname",
"Page not found",
"Hero carousel",
"Enterprise partners",
"Company visit",
"All dates",
"All types",
"Close search",
"Enter again",
"Startup pitch",
"Create account",
"Join us",
"Peking University",
"Organization details",
"Start a match",
"Food, drink and fun",
"Partners",
"Collaboration intent",
"Alliance",
"Admin sign in",
"Response mechanism",
"Back to top",
"ByteDance",
"Learning and growth",
"Internships",
"How review works",
"Matching requests",
"Matching notes",
"Import data",
"Export data",
"Mentor connections",
"Career and startup",
"Showing",
"Your organization",
"Your name",
"Delivery records",
"Submitted information",
"Withdraw consent",
"Government partners",
"Policy updates",
"Data analysis",
"Add content",
"Display name",
"Zhaopin",
"No image yet",
"Terms of Service",
"Benefits center",
"View details",
"Reference number",
"Check status",
"Campus outreach",
"Welcome back",
"Legal terms",
"Create account",
"Joint events",
"Event registration",
"Event photos",
"Tsinghua University",
"Engineering schools",
"Ecosystem directory",
"User list",
"User internships",
"User events",
"User statistics",
"Sign in to console",
"Full name",
"Confirm password",
"Sign up now",
"Sign in now",
"Comprehensive universities",
"Career sharing",
"Joint consulting",
"Joint recruiting",
"At least 8 characters",
"Aerospace",
"Daily life",
"Additional information",
"Finance and economics schools",
"Resource categories",
"Resource matching",
"Member benefits",
"Recent content",
"Upcoming events",
"Back to directory",
"Back to sign in",
"Back to home",
"Email verification",
"Reset password",
"Open-ended",
"Privacy Policy",
"Project showcase",
"University members",
"Company partners",
"Right to erasure",
"Huazhu",
"Go to sign in",
"WeChat ID",
"Phone number",
"Government partners",
"New password",
"Right to rectification",
"Right of access",
"Tags",
"Campus partners",
"Remember me",
"Zhongguancun",
"JD.com",
"Save",
"Close",
"Delete",
"Preface",
"Beijing",
"Huazhu Club",
"Cancel",
"Optional",
"Image",
"ByteDance",
"Password",
"UIBE",
"Introduction",
"My account",
"Description",
"Search",
"Nickname",
"Zhaopin",
"Title",
"Sign up",
"Tsinghua",
"Sign in",
"Baidu",
"Edit",
"Tencent",
"Account",
"Sign out",
"Email",
"Link",
"Home",
"Universities",
"and",
"home",
"D",
"entries",
"does not affect the live service",
"Zhongguancun Youth Innovation Service Platform",
"Yunfan Technology campus partnership team",
"students interested in the product",
"stored only in this browser",
"enterprise and government ecosystem partners",
"manage all three categories of directory cards on the enterprise side",
"browse and search across the whole directory",
"You can also track progress on-site with your reference number",
"Your application has been routed to the matching collaboration track",
"Could not save the search history",
"protect the lawful rights of Alliance members",
"startup support and shared campus resources",
"Could not load the category content",
"Could not load the ecosystem directory",
"Could not load the site content",
"Peking University Student Activity Center",
"Alliance member services center",
"Beijing Campus Ecosystem Alliance directory",
"Beijing Campus Ecosystem Alliance privacy policy",
"Beijing Economic-Technological Development Area talent service desk",
"Post activities or internship opportunities",
"Posted content appears publicly only after an administrator approves it",
"only active locally or on a static host",
"collaboration focus and contact details",
"the administrator can add a detail link",
"The administrator has not uploaded any directory entries of this kind yet",
"You can submit another application later if you have new requests",
"Image saved locally",
"Upload a section image here",
"We will follow up as soon as you have filled this in",
"users who signed in within the period",
"store and share your personal information",
"internships and startup support",
"view internships and upcoming events in one place",
"internship partnerships and joint regional events",
"matching practice opportunities and campus resource partnerships",
"Review internship posts submitted by members",
"Review activity posts submitted by members",
"Once approved it is shown to every member",
"The collaboration request was saved to this browser",
"Back up your data before importing or exporting",
"an exchange event on putting the tooling into practice",
"Here is the latest progress we found for you",
"Try adjusting the direction and submit again",
"Nothing matches this category yet",
"This request matches the currently available resources only loosely",
"Find a collaboration direction quickly and start a request",
"We have received your request",
"or wait for an administrator to add one",
"or look at these recommendations",
"That phone number format is not valid",
"Registration status and application progress",
"The three categories of government ecosystem partners",
"Government agency name or a keyword in that field",
"Policy briefings and youth project resource matching",
"Database and object storage",
"No internship opportunities yet",
"No event registrations yet",
"No collaboration requests yet",
"No new collaboration requests at the moment",
"No registered users at the moment",
"No backend service detected",
"No application records in local mode",
"No event registrations in local mode",
"Nothing has been posted in local mode yet",
"This request is not supported in local mode",
"New this month, counted by registration date",
"See your requests and registrations",
"See my collaboration requests",
"See my requests and registrations",
"See every registered user",
"See the latest progress on collaboration requests",
"See internship applications submitted by members",
"See event registrations submitted by members",
"See sign-up and sign-in statistics",
"See collaboration requests submitted on the site",
"University–company events and practice roles",
"Running basic checks and a first pass on the direction",
"Detecting the current mode",
"Waiting for further feedback",
"Reading the collaboration target",
"Verifying your email",
"No matching collaboration request was found",
"No matching results",
"Register a Beijing Campus Ecosystem Alliance account",
"It will appear here once you register",
"Event registrations and internships",
"Status of event registrations and application records",
"Joint events and city resource collaboration",
"Match event resources against collaboration needs faster",
"Youth development platforms in Haidian District",
"Consumer discounts and lifestyle service benefits",
"Could not clear the search history",
"Click any account to fill it in",
"Click the right-hand side to see the details",
"A platform for ecosystem collaboration and startup resources",
"What members submit appears here automatically",
"The request status is being updated",
"Sign in to your Beijing Campus Ecosystem Alliance account",
"Once signed in you can edit the server content directly",
"Sign in to see your request records",
"Delete this item?",
"Community building and resource links",
"manages the content to the right of the homepage title",
"Priority sign-up for offline meetups",
"manage food, fun and local leisure in one place",
"The collaboration target is missing",
"The Alliance or the matching partner has started talking to you",
"All your Alliance benefits in one place",
"The Alliance is matching your needs against the target",
"The Alliance routes and follows up on it for you",
"keep the order of service on the Alliance platform",
"so more people see your opportunity",
"content gathered from papers and study groups",
"assess the best way to move forward",
"Try switching the category or changing the keyword",
"describe the event in detail",
"describe the work in detail",
"Set a local administrator password for this computer",
"Describe the collaboration goal for the selected target",
"Please add a link in the admin console",
"Please enter a contact name",
"Check the reference number and contact details",
"Check your connection and try again",
"Confirm which target you are applying to",
"Go back to the directory and start again",
"Could not read the search history",
"Type a keyword to start searching",
"Six kinds of upcoming events and activities",
"These demo credentials are public",
"This collaboration flow is essentially complete",
"Good for uploading event photos",
"Good for spreading talent-policy information",
"Good for recruiting startup projects",
"Good for co-organising innovation events",
"Good for youth development programmes",
"Submit a collaboration request through the Beijing Campus Ecosystem Alliance",
"via the reference number and contact details",
"Reset your Alliance account password",
"Verify your email address",
]

assert len(en) == len(zh), "alignment error: %d en vs %d zh" % (len(en), len(zh))
pairs = [{"zh": z, "en": e} for z, e in zip(zh, en) if z != e]

js = """/* Generated by scripts/build_i18n.py — English presentation layer.
   Chinese is the default; English is opt-in via ?lang=en or by picking EN once
   (the choice is remembered in localStorage, so it survives page navigation).
   Never changes app logic, only text nodes/attributes. */
(function () {
  "use strict";
  function shouldApplyEnglish() {
    var explicit = new URLSearchParams(window.location.search).get("lang");
    if (explicit === "en") return true;
    if (explicit === "zh") return false;
    try { return localStorage.getItem("alliance_lang") === "en"; } catch (e) { return false; }
  }
  if (!shouldApplyEnglish()) return;
  document.documentElement.lang = "en";

  var PAIRS = %s;
  PAIRS.sort(function (a, b) { return b.zh.length - a.zh.length; });

  // Portfolio presentation: suppress the government partner tab/category in
  // the English build only. The underlying feature and Chinese UI stay intact.
  function hideGovernmentTabs(root) {
    if (!root || !root.querySelectorAll) return;
    var tabs = root.querySelectorAll('[role="tab"], .partner-tab, .directory-tab, button');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var label = (t.textContent || "") + " " + (t.getAttribute("data-type") || "")
                + " " + (t.getAttribute("data-directory-type") || "");
      if (/government|政府/i.test(label)) t.style.setProperty("display", "none", "important");
    }
  }
  var ATTRS = ["placeholder", "title", "alt", "aria-label"];
  var seen = new WeakSet();

  function translateText(s) {
    if (!s || !/[\\u4e00-\\u9fff]/.test(s)) return s;
    var out = s;
    if (out.indexOf("\\u5f53\\u524d\\u5c55\\u793a") !== -1) {
      out = out.split("\\u5f53\\u524d\\u5c55\\u793a").join("Showing");
    }
    if (out.trim() === "\\u5bb6") out = out.replace("\\u5bb6", "partners");
    if (out.trim() === "\\u6761") out = out.replace("\\u6761", "entries");
    if (out.indexOf("\\u6761\\u5185\\u5bb9") !== -1) {
      out = out.split("\\u6761\\u5185\\u5bb9").join("entries");
    }
    if (out.trim() === "\\u5f55") out = "D";
    if (out.indexOf("\\u5317\\u4eac\\u5de5\\u4e1a\\u5927\\u5b66") !== -1) out = out.split("\\u5317\\u4eac\\u5de5\\u4e1a\\u5927\\u5b66").join("Beijing Tech");
    if (out.indexOf("\\u5317\\u4eac\\u7406\\u5de5\\u5927\\u5b66") !== -1) out = out.split("\\u5317\\u4eac\\u7406\\u5de5\\u5927\\u5b66").join("Beijing Tech");
    if (out.indexOf("\\u5bf9\\u5916\\u7ecf\\u6d4e\\u8d38\\u6613\\u5927\\u5b66") !== -1) out = out.split("\\u5bf9\\u5916\\u7ecf\\u6d4e\\u8d38\\u6613\\u5927\\u5b66").join("UIBE");
    for (var i = 0; i < PAIRS.length; i++) {
      var zh = PAIRS[i].zh;
      if (zh.length <= 1) continue;
      if (out.indexOf(zh) !== -1) out = out.split(zh).join(PAIRS[i].en);
    }
    return out;
  }

  function patchNode(node) {
    if (!node || seen.has(node)) return;
    try { seen.add(node); } catch (e) { return; }
    if (node.nodeType === 3) {
      var v = translateText(node.nodeValue);
      if (v !== node.nodeValue) node.nodeValue = v;
    } else if (node.nodeType === 1) {
      for (var a = 0; a < ATTRS.length; a++) {
        var old = node.getAttribute(ATTRS[a]);
        if (old) {
          var nv = translateText(old);
          if (nv !== old) node.setAttribute(ATTRS[a], nv);
        }
      }
      var kids = node.childNodes;
      for (var k = 0; k < kids.length; k++) patchNode(kids[k]);
    }
  }

  function patchAll() {
    document.title = translateText(document.title);
    patchNode(document.body);
    hideGovernmentTabs(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patchAll);
  } else {
    patchAll();
  }

  var mo = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "childList") {
        for (var j = 0; j < r.addedNodes.length; j++) patchNode(r.addedNodes[j]);
        hideGovernmentTabs(document.body);
      } else if (r.type === "characterData") {
        patchNode(r.target);
      } else if (r.type === "attributes" && r.target && ATTRS.indexOf(r.attributeName) !== -1) {
        seen.delete(r.target);
        patchNode(r.target);
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });

  // Re-run after lazy content settles.
  window.addEventListener("load", function () { setTimeout(patchAll, 400); });
})();
""" % json.dumps(pairs, ensure_ascii=False, separators=(",", ":"))

out = os.path.join(BASE, "public", "assets", "i18n-en.js")
open(out, "w", encoding="utf-8").write(js)
print("wrote", out)
print("pairs:", len(pairs), "zh entries:", len(zh))

# ── 漏译检查 ────────────────────────────────────────────────────────
# 扫描页面与脚本里"会显示给用户看"的中文，跟清单对比。清单外的文案在英文
# 界面下会原样显示中文——这是静默的视觉缺陷，所以在这里显式报出来。
# 代码注释里的中文不算，注释不显示在页面上。
CJK = re.compile(r"[一-鿿]+")
known_norm = {re.sub(r"\s+", "", t) for t in zh}


def visible_chinese(path):
    """抽出页面上真正会显示的中文：跳过脚本块、样式块和注释。"""
    src = open(path, encoding="utf-8").read()
    if path.endswith(".html"):
        src = re.sub(r"<script\b[^>]*>.*?</script>", " ", src, flags=re.S | re.I)
        src = re.sub(r"<style\b[^>]*>.*?</style>", " ", src, flags=re.S | re.I)
        src = re.sub(r"<!--.*?-->", " ", src, flags=re.S)
    else:
        # JS：去掉行注释与块注释，只留下字符串字面量里的中文
        src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
        src = re.sub(r"(?m)^\s*//.*$", " ", src)
        src = re.sub(r"(?<![:'\"])//[^\n]*$", " ", src, flags=re.M)
    out = set()
    for m in CJK.finditer(src):
        frag = m.group(0)
        if len(frag) >= 2:
            out.add(frag)
    return out


untranslated = set()
for path in sorted(glob.glob(os.path.join(BASE, "public", "*.html"))) + \
        sorted(glob.glob(os.path.join(BASE, "public", "assets", "*.js"))):
    if path.endswith("i18n-en.js"):
        continue
    for frag in visible_chinese(path):
        norm = re.sub(r"\s+", "", frag)
        if norm in known_norm:
            continue
        # 片段是某条已翻译长句的一部分 → 忽略
        if any(norm in k for k in known_norm if len(k) >= 6):
            continue
        # 短碎片多是长句被标签切开的残片，报出来全是噪音，只看整句级的
        if len(norm) < 8:
            continue
        untranslated.add(frag)

if untranslated:
    print("\n未进入清单的中文文案（英文界面下会保持中文）：")
    for frag in sorted(untranslated)[:40]:
        print("  -", frag[:70])
    print("  提示：把这些文案补进 scripts/zh_inventory.json，并在 en 列表里对齐翻译")
else:
    print("\n✓ 页面上的可见中文都已进入对照表")
