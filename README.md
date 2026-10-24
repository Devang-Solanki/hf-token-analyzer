<p align="center">
  <img src="public/logo.png" alt="HuggingFace Token Analyzer Logo" width="120" height="120" />
</p>

<h1 align="center">Token Analyzer</h1>

<p align="center">
  See what a HuggingFace or GitHub access token can reach.<br />
  <a href="https://token.devanghacks.in/"><strong>token.devanghacks.in</strong></a>
</p>

<p align="center">
   <a href="https://www.gnu.org/licenses/gpl-3.0.en.html/"><img src="https://img.shields.io/badge/license-GPL_3.0-_red.svg"></a>
   <a href="https://twitter.com/devangsolankii"><img src="https://img.shields.io/twitter/follow/devangsolankii.svg?logo=twitter"></a>
</p>

## ✨ Features

- **🔒 Your token stays in the browser**: it is sent to the service it belongs to and nowhere else
- **🧭 Recognises the provider from the token format**: nothing is transmitted until a provider claims it
- **⚖️ A verdict, not a dump**: one line telling you how far a leak of this token would reach
- **🔑 Permission matrix**: every permission, with the ones that can change things marked
- **🏢 Organizations**: membership, your role, and the restrictions that may block the token
- **📦 Repositories**: everything the token opens, filterable by kind, visibility and write access, and flagged when a listing is incomplete
- **🎯 Fine-grained scopes**: the exact resources a scoped token names
- **⏰ Expiry**: when it stops working, and a warning when it never does
- **🌙 Light and dark**: resolved before first paint, so there is no flash

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Devang-Solanki/hf-token-analyzer.git
cd hf-token-analyzer

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready to be deployed to any static hosting service.

## 🔍 How It Works

1. **Enter your HuggingFace API token** in the input field
2. **Click "Analyze token"**
3. **Read the verdict** at the top, then drill in across three tabs:
   - **Findings**: what is worth acting on, most severe first
   - **Permissions**: what the token can and cannot do, plus fine-grained scopes
   - **Access**: organizations and repositories the token reaches

### Token Types Supported

| Type | Description |
|------|-------------|
| **Read** | Read-only access to public and gated repos |
| **Write** | Read and write access to repos |
| **Admin** | Full administrative access |
| **Fine-Grained** | Custom scoped permissions |

## 🛡️ Privacy & Security

This tool is designed with privacy as a top priority:

- ✅ **No server-side processing** - the analysis runs in your browser
- ✅ **No data storage** - your token is never saved, and it is cleared when you reload
- ✅ **Open source** - audit the code yourself
- ℹ️ **Anonymous page counts** - the hosted version loads [Umami](https://umami.is) to count visits. It never receives your token or anything read with it, and self-hosted builds can drop the one `<script>` tag in `index.html`.

Token requests go directly from your browser to the provider's own API.

## 🎨 Design

Shares the design language of [devanghacks.in](https://devanghacks.in): editorial-brutalist
terminal. Space Grotesk for display, JetBrains Mono for body text, dark by default via
`data-theme` on `<html>`, zero border radius, a faint blueprint dot grid, and tracked uppercase
labels. The fonts are the same self-hosted woff2 files, so the page makes no third-party
request.

One rule is this tool's own: **hue encodes severity**. The brand accent (lime in dark, teal in
light) is used for interactive chrome only, and the severity ramp is tuned to stay clear of its
hue - `elevated` is orange rather than amber, because amber sits at the same hue as the lime
accent and a warning must never be mistakable for a button.

The light theme links in `#1a5fc4` rather than the site's `#2F89FC`, which measures 3.15:1 on
`#F5F5F5` and fails the 4.5:1 body-text floor.

## 🏗️ Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Space Grotesk / IBM Plex Mono** - Typefaces
- **Lucide React** - Icons

## 📁 Project Structure

Sources that are not shipped live in `assets/`. The full-size logo original is not kept
there - it is already in git history, and `public/logo.png` is derived from it:

```bash
git show 1881b02:public/logo.png > logo-source.png
```

```
assets/
└── og-template.html    # renders to public/og.png; see the comment at its top

src/
├── components/
│   └── ui/           # small shadcn-style primitives
│       ├── badge.tsx
│       ├── button.tsx
│       ├── input.tsx
│       └── tabs.tsx
├── providers/        # one analyzer per service; the UI renders their common output
│   ├── types.ts      # the TokenReport contract every provider produces
│   ├── http.ts       # shared cursor pagination
│   ├── huggingface.ts
│   ├── github.ts
│   └── index.ts      # registry and format detection
├── lib/
│   └── utils.ts      # Utility functions
├── services/
│   └── tokenAnalyzer.ts  # Token analysis logic
├── types/
│   └── huggingface.ts    # TypeScript types
├── App.tsx           # Main application
├── main.tsx          # Entry point
└── index.css         # Global styles
```

## 🔌 Providers

A provider is recognised from the token's format before any request is made, so a credential
for an unsupported service is never transmitted by accident.

| Provider | Token formats | What is reported |
|---|---|---|
| **HuggingFace** | `hf_` | role, fine-grained scopes, orgs, repositories |
| **GitHub** | `ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, legacy 40-hex | classic scopes, orgs, repositories |

### Why only these two

Everything runs in the browser, so a provider is only supportable if its API allows a
cross-origin request carrying an `Authorization` header. That is a property of the provider,
not a choice. npm, Docker Hub and Anthropic refuse the preflight outright; no amount of
client-side code gets around it, and adding a server-side proxy would mean your token passes
through someone else's machine, which defeats the point of the tool.

### Known limits

- **GitHub expiry is invisible.** GitHub returns it in `github-authentication-token-expiration`,
  which is not in its `Access-Control-Expose-Headers`, so a browser cannot read it. The UI says
  "Not reported" rather than guessing "never".
- **GitHub fine-grained permissions are not published.** No endpoint reports them. Establishing
  them means calling endpoints to see which succeed, which this tool will not do with a
  credential that may not be yours. Fine-grained tokens are judged by what they open instead.
- **Listings stop after 10 pages**, and a cursor header is not always readable cross-origin.
  When a listing ends early the counts carry a `+` and the UI says so, because under-reporting
  what a token reaches is worse than over-warning about it.

## 🔧 API Endpoints Used

HuggingFace:
- `GET /api/whoami-v2` - information about the authenticated user and token
- `GET /api/{models,datasets,spaces}?author=...` - repository listings, followed page by page

GitHub:
- `GET /user` - identity, plus `X-OAuth-Scopes` and `X-GitHub-SSO` response headers
- `GET /user/orgs` - organization membership
- `GET /user/repos` - repository listings, followed via the `Link` header
- `GET /gists` - gists, including secret ones, when the token carries `gist`

Secret gists are reported as **Secret**, not Private: anyone holding the link can read one, so
calling it private would overstate how protected it is.

## 📝 Token Permissions Analyzed

| Permission | Description |
|------------|-------------|
| Read Models | Access to read model repositories |
| Write Models | Ability to create/modify models |
| Read Datasets | Access to read dataset repositories |
| Write Datasets | Ability to create/modify datasets |
| Read Spaces | Access to read Space repositories |
| Write Spaces | Ability to create/modify Spaces |
| Access Gated Repos | Access to gated/restricted content |
| Manage Repositories | Create/delete repositories |
| Write Discussions | Post in discussions |
| Write Posts | Create blog posts |
| Access Billing | View billing information |
| Manage Organizations | Admin access to organizations |
| Admin Access | Full administrative privileges |

## ➕ Adding a provider

Implement the `Provider` interface in [`src/providers/types.ts`](src/providers/types.ts) and add
it to the registry in [`src/providers/index.ts`](src/providers/index.ts). No component changes
are needed - the UI renders `TokenReport` and nothing else.

Before writing any code, check the provider actually permits a browser request:

```bash
curl -s -i -X OPTIONS https://api.example.com/whoami \
  -H "Origin: https://example.org" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" \
  | grep -i '^access-control-'
```

You need `access-control-allow-origin` and `authorization` in `access-control-allow-headers`.
If either is missing, the provider cannot be supported without a proxy, and a proxy is not an
option here.

Anything a provider cannot determine must be represented as unknown rather than defaulted. A
confident wrong answer about a credential's reach is worse than an admitted gap.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [HuggingFace](https://huggingface.co) for their amazing platform and API
- [shadcn/ui](https://ui.shadcn.com) for the beautiful UI components
- [Lucide](https://lucide.dev) for the icons

## ⚠️ Disclaimer

This tool is not officially affiliated with HuggingFace. Use at your own discretion. Always keep your API tokens secure and never share them publicly.

---

Made with ❤️ for the Security community