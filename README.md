<p align="center">
  <img src="public/logo.png" alt="HuggingFace Token Analyzer Logo" width="120" height="120" />
</p>

<h1 align="center">HuggingFace Token Analyzer</h1>

<p align="center">
   <a href="https://www.gnu.org/licenses/gpl-3.0.en.html/"><img src="https://img.shields.io/badge/license-GPL_3.0-_red.svg"></a>
   <a href="https://twitter.com/devangsolankii"><img src="https://img.shields.io/twitter/follow/devangsolankii.svg?logo=twitter"></a>
</p>

## ✨ Features

- **🔒 100% Client-Side**: Your token never leaves your browser - all analysis happens locally
- **📊 Comprehensive Analysis**: Understand exactly what your token can and cannot do
- **👤 User Information**: View user profile, PRO status, and email verification
- **🏢 Organization Access**: See all organizations your token has access to
- **🔑 Permission Matrix**: Visual breakdown of all permissions (read/write models, datasets, spaces, etc.)
- **⏰ Token Expiration**: Check when your token expires and get warnings
- **🎯 Fine-Grained Scopes**: Detailed view of fine-grained token permissions
- **🌙 Dark Mode Support**: Beautiful UI that works in both light and dark modes

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/hf-token-analyzer.git
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
2. **Click "Analyze"** to start the analysis
3. **View the results** across four tabs:
   - **Overview**: Token info and user profile
   - **Permissions**: What the token can/cannot do
   - **Organizations**: Org memberships and roles
   - **Scopes**: Fine-grained permission details

### Token Types Supported

| Type | Description |
|------|-------------|
| **Read** | Read-only access to public and gated repos |
| **Write** | Read and write access to repos |
| **Admin (God)** | Full administrative access |
| **Fine-Grained** | Custom scoped permissions |

## 🛡️ Privacy & Security

This tool is designed with privacy as a top priority:

- ✅ **No server-side processing** - Everything runs in your browser
- ✅ **No data storage** - Your token is never saved anywhere
- ✅ **No analytics** - We don't track your usage
- ✅ **Open source** - Audit the code yourself

The only network request made is directly to the HuggingFace API (`https://huggingface.co/api/whoami-v2`) from your browser.

## 🏗️ Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Lucide React** - Icons

## 📁 Project Structure

```
src/
├── components/
│   └── ui/           # shadcn/ui components
│       ├── alert.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── tabs.tsx
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

## 🔧 API Endpoints Used

The analyzer uses the following HuggingFace API endpoint:

- `GET /api/whoami-v2` - Returns information about the authenticated user and token

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

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [HuggingFace](https://huggingface.co) for their amazing platform and API
- [shadcn/ui](https://ui.shadcn.com) for the beautiful UI components
- [Lucide](https://lucide.dev) for the icons

## ⚠️ Disclaimer

This tool is not officially affiliated with HuggingFace. Use at your own discretion. Always keep your API tokens secure and never share them publicly.

---

Made with ❤️ for the Security community
