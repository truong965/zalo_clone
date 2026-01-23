const { io } = require("socket.io-client");

// --- CẤU HÌNH ---
const SERVER_URL = 'http://localhost:8000/socket.io'; // Đảm bảo đúng port backend

// ⚠️ QUAN TRỌNG: Bạn cần lấy 2 Token thật từ API Login (Postman)
const TOKEN_USER_A = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlZGZlNWIzOC1iNGM5LTRlYWEtOWI3MC1lYTBkNGQ5NTI5MWYiLCJ0eXBlIjoiYWNjZXNzIiwicHdkVmVyIjoxLCJpYXQiOjE3NjkxNjM3MzIsImV4cCI6MTc3NzgwMzczMn0.XvOKGTqPGUIzgsbme3qhXfP6plZbXH92fQWHL9acDOA';
const TOKEN_USER_B = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjNjZGNhYi1hZTY4LTQ0YTItODAwMS02ODA2MTQ2ZTliYjEiLCJ0eXBlIjoiYWNjZXNzIiwicHdkVmVyIjoxLCJpYXQiOjE3NjkxNjQ0NzAsImV4cCI6MTc3NzgwNDQ3MH0.zhsPvxFcIJRbSVnhEhrXVHauvfmWAz96GmS-e8PBlSs';

// Hàm giả lập kết nối thiết bị
function connectDevice(userLabel, deviceName, token, platform, userAgent) {
  const socket = io(SERVER_URL, {
    auth: { token: token },
    transports: ['websocket'],
    // Giả lập Header để DeviceFingerprintService nhận diện
    extraHeaders: {
      'User-Agent': userAgent,
      'X-Device-Name': deviceName,
      'X-Platform': platform
    }
  });

  socket.on('connect', () => {
    console.log(`✅ [${userLabel} - ${deviceName}] Connected! SocketID: ${socket.id}`);
  });

  socket.on('authenticated', (data) => {
    console.log(`🔐 [${userLabel} - ${deviceName}] Authenticated. Server: ${data.serverInstance}`);
  });

  socket.on('error', (err) => console.error(`❌ [${userLabel} - ${deviceName}] Error:`, err));
  
  return socket;
}

async function runScenario() {
  console.log('🚀 BẮT ĐẦU KỊCH BẢN TEST MULTI-USER / MULTI-DEVICE\n');

  // --- PHASE 1: User A & User B bắt đầu dùng thiết bị đầu tiên ---
  console.log('--- PHASE 1: Initial Devices ---');
  
  // User A dùng Laptop Windows
  connectDevice('USER A', 'Laptop Cá Nhân', TOKEN_USER_A, 'WINDOWS', 
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  // User B dùng iPad
  connectDevice('USER B', 'iPad Air', TOKEN_USER_B, 'IOS', 
    'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1');

  // Chờ 3 giây...
  await new Promise(r => setTimeout(r, 3000));

  // --- PHASE 2: Cả 2 user chuyển sang/dùng thêm thiết bị thứ 2 ---
  console.log('\n--- PHASE 2: Additional Devices (Switching) ---');

  // User A cầm điện thoại lên (iPhone)
  connectDevice('USER A', 'iPhone 14 Pro', TOKEN_USER_A, 'IOS', 
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  // User B ngồi vào máy tính công ty (Macbook)
  connectDevice('USER B', 'Macbook Pro M2', TOKEN_USER_B, 'MACOS', 
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log('\n⏳ Đã kết nối xong 4 thiết bị. Giữ kết nối để kiểm tra Redis...');
  
  // Giữ process không bị thoát để socket không bị disconnect
  setInterval(() => {}, 10000);
}

runScenario();