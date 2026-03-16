# Zalo Clone Mobile (Expo)

Mobile app migrate basic pages and flows from web version:
- Auth: login/register
- Tabs: chats, contacts, calls, profile
- QR code mobile approval flow: scan + confirm login for web
- Basic session device management: list sessions + revoke session

## 1) Install and run

```bash
npm install
npx expo start
```

## 2) Configure API for real device testing

By default, app will auto-detect your dev machine host from Metro and call:

`http://<METRO_HOST>:<EXPO_PUBLIC_API_PORT>`

Recommended `.env`:

```bash
EXPO_PUBLIC_API_PORT=8000
EXPO_PUBLIC_API_DEBUG=true
```

If you need to force a fixed host, set this optional override:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_PC_LAN_IP>:8000
```

Backend endpoints are called through `BASE_URL + /api/v1/...`.

## 3) QR login test flow on physical device

1. Login mobile account in app.
2. Open Profile tab.
3. Tap `Quet QR dang nhap web`.
4. Scan QR shown on web login screen.
5. If backend returns `requireConfirm = true`, tap `Xac nhan dang nhap`.
6. Web client will continue exchange and login.

## 4) Notes

- QR scanner uses `expo-camera`, so camera permission is required.
- Device management currently uses backend API:
  - `GET /api/v1/auth/sessions`
  - `DELETE /api/v1/auth/sessions/:deviceId`
