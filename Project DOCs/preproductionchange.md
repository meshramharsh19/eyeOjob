in auth.js we have to use redis while production
"const otpStore = new Map();" for storing the otp

google cloud console mein jaa kr port allow krna padhta hai google OAuth k liye


client/
├── index.html
├── vite.config.js
├── package.json
├── .env.example / .env.development
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.jsx                  # entry point
    ├── index.css                 # global styles
    ├── app/
    │   └── App.jsx                # root component / routes
    ├── config/
    │   └── env.js                 # env variable config
    ├── features/                  # feature-based modules
    │   ├── auth/
    │   │   ├── api/auth.api.js
    │   │   ├── components/ProtectedRoute.jsx
    │   │   ├── context/AuthContext.jsx
    │   │   ├── pages/ (Login, Register, ForgotPassword, AuthSuccess)
    │   │   └── index.js
    │   ├── applications/
    │   │   ├── api/          (empty currently)
    │   │   ├── components/   (empty currently)
    │   │   └── pages/        (empty currently)
    │   ├── dashboard/
    │   │   ├── pages/Dashboard.jsx
    │   │   └── index.js
    │   ├── layout/
    │   │   └── components/   (empty currently)
    │   └── common/
    │       └── pages/         (empty currently)
    └── shared/                    # cross-feature reusable code
        ├── assets/ (logo-dark.png, logo-light.png)
        ├── components/   (empty currently)
        ├── lib/axios.js
        └── utils/        (empty currently)
