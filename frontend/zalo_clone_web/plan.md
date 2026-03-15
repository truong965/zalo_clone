# Web Notification Sound UX Plan

## 1. Mục tiêu

Tăng khả năng nhận biết thông báo khi người dùng bật Do Not Disturb ở hệ điều hành, đồng thời không gây spam âm thanh.

Phạm vi áp dụng cho toàn bộ push types đi qua Service Worker:
- INCOMING_CALL
- MISSED_CALL
- NEW_MESSAGE
- FRIEND_REQUEST
- FRIEND_ACCEPTED
- GROUP_EVENT
- Generic fallback (data.title)

## 2. Thực trạng và ràng buộc kỹ thuật

### 2.1 Thực trạng
- Hiện tại app đã hiển thị OS notification theo từng push type.
- Khi OS Do Not Disturb bật, OS notification/sound có thể bị suppress.
- Hiện chưa có chiến lược âm thanh web thống nhất cho tất cả push types.

### 2.2 Ràng buộc trình duyệt
- Service Worker không phải lúc nào cũng phát audio ổn định như tab chính.
- Nhiều trình duyệt giới hạn autoplay audio nếu chưa có user gesture.
- Browser background tab có thể bị throttling timer/audio.

Kết luận kiến trúc:
- Không nên phụ thuộc 100% vào audio từ Service Worker.
- Nên dùng mô hình hybrid: SW gửi tín hiệu, app shell quyết định phát âm thanh theo policy.

## 3. Thiết kế UX âm thanh đề xuất

### 3.1 Phân cấp mức độ ưu tiên âm thanh

Priority P0 (khẩn cấp):
- INCOMING_CALL
- Hành vi: phát ringtone loop ngắn (ví dụ 20-30s hoặc tới khi user tương tác)

Priority P1 (quan trọng):
- NEW_MESSAGE (direct chat)
- Hành vi: 1 sound ngắn, có cooldown mạnh

Priority P2 (trung bình):
- NEW_MESSAGE (group), FRIEND_REQUEST, GROUP_EVENT quan trọng
- Hành vi: 1 sound ngắn nhẹ hơn, có rate limit

Priority P3 (thông tin):
- FRIEND_ACCEPTED, MISSED_CALL, GROUP_EVENT thông thường, generic fallback
- Hành vi: mặc định im lặng hoặc chỉ rung nhẹ UI (badge), tùy user setting

### 3.2 Chống làm phiền (anti-noise controls)

Áp dụng đồng thời 4 lớp:

1. Global cooldown:
- Không phát quá 1 sound mỗi X giây (đề xuất X=8)

2. Per-type cooldown:
- INCOMING_CALL: cho phép lặp nhưng giới hạn tối đa thời lượng
- NEW_MESSAGE: tối đa 1 sound mỗi conversation trong 15s
- GROUP_EVENT: tối đa 1 sound mỗi 30s

3. Quiet hours:
- Loại bỏ khỏi phạm vi hiện tại để giảm độ phức tạp và rủi ro.

4. Escalation rules:
- Nếu user đang active tab chat tương ứng thì không phát sound (tránh trùng với realtime UI)
- Nếu app visible nhưng unfocused: có thể phát sound nhẹ cho P1, tắt P2/P3

## 4. Kiến trúc kỹ thuật đề xuất

### 4.1 Mô hình Event Bridge (khuyến nghị)

Luồng:
1. SW nhận push
2. SW hiển thị notification như hiện tại
3. SW postMessage về app với payload chuẩn hóa (type, conversationId, priority)
4. Notification Sound Manager (chạy trong app shell) quyết định có phát sound hay không theo policy + user settings + cooldown

Lợi ích:
- Policy tập trung, dễ kiểm soát UX
- Dễ A/B test
- Không phụ thuộc hoàn toàn vào khả năng audio của SW

### 4.2 Notification Sound Manager

Tạo module trung tâm:
- Input: normalized notification events
- Context:
  - document.visibilityState
  - focused/unfocused
  - active route (chat hiện tại)
  - user sound settings
  - cooldown state in-memory
- Output:
  - play sound id (ringtone/message/chime)
  - skip reason (for telemetry)

### 4.3 User settings cần có

Đề xuất thêm trong Settings > Notifications:
- Enable notification sounds (master)
- Incoming calls sound
- Message sound (direct)
- Message sound (group)
- Social updates sound (friend/group event)
- Volume preset (Low/Medium/High)

Mặc định đề xuất:
- Calls: ON
- Direct message: ON
- Group message: OFF
- Social updates: OFF

## 5. Chính sách theo từng push type

| Type | Default sound | Cooldown | Ghi chú UX |
|---|---|---|---|
| INCOMING_CALL | Ringtone loop | Không áp global cooldown, chỉ max-duration | Dừng khi accept/reject/hangup/timeout |
| NEW_MESSAGE (direct) | Short ping | 8s global + 15s per conversation | Skip nếu đang mở đúng conversation |
| NEW_MESSAGE (group) | Short soft ping (optional) | 8s global + 20s per conversation | Mặc định OFF để giảm ồn |
| MISSED_CALL | Optional single chime | 30s | Mặc định OFF |
| FRIEND_REQUEST | Optional single chime | 30s | Mặc định OFF |
| FRIEND_ACCEPTED | OFF | N/A | Chỉ badge/toast |
| GROUP_EVENT | Optional single chime theo subtype | 30s | Chỉ subtype quan trọng mới có sound |
| Fallback generic | OFF | N/A | Không đủ ngữ cảnh để phát sound an toàn |

## 6. Rollout plan theo phase

### Phase 1: Instrumentation + policy skeleton
- Chuẩn hóa event payload từ SW -> app
- Tạo Notification Sound Manager (no-op mode, chỉ log)
- Telemetry:
  - sound_played
  - sound_suppressed
  - suppress_reason
  - notification_type

### Phase 2: Enable core sounds
- Bật sound cho INCOMING_CALL + NEW_MESSAGE direct
- Áp dụng global/per-type cooldown
- Thêm toggle master + 2 toggle cơ bản (call/message)

### Phase 3: Advanced controls
- Fine-grained type toggles
- Group/social sound policies
- A/B test ngưỡng cooldown

### Phase 4: Optimization
- Tối ưu theo telemetry
- Điều chỉnh default policy theo retention + complaint rate

## 7. KPI đánh giá hiệu quả

Primary:
- Missed call rate giảm
- Time-to-attend incoming call giảm
- Message response latency cho direct chats giảm

Guardrail:
- Mute/tắt sound rate không tăng đột biến
- Complaint rate về “quá ồn” không tăng
- Notification permission revoke rate không tăng

## 8. Test plan

Manual test matrix:
- Browser focused, visible, hidden, minimized
- OS DND on/off
- Single tab vs multi-tab
- Call direct/group
- Message direct/group

Automation:
- Unit test Notification Sound Manager policy decisions
- Integration test SW message -> app bridge parsing
- E2E smoke: incoming call click notification opens app and renders call UI

## 9. Rủi ro và giảm thiểu

1. Audio bị browser chặn autoplay
- Giảm thiểu: unlock audio context sau user gesture đầu tiên

2. Multi-tab phát trùng âm thanh
- Giảm thiểu: leader election (BroadcastChannel/localStorage lock) để chỉ 1 tab phát sound

3. Quá nhiều sound trong group đông
- Giảm thiểu: mặc định OFF group sound + per-conversation cooldown

4. Inconsistent behavior giữa browser
- Giảm thiểu: feature flags theo browser profile

## 10. Kiến trúc đã chốt cho giai đoạn hiện tại

1. Mô hình phát sound:
- Chọn B: Hybrid SW -> App Sound Manager

2. Mặc định cho group message sound:
- Chọn OFF

3. Fallback generic push:
- Chọn OFF mặc định

4. Multi-tab policy:
- Chọn chỉ 1 tab leader phát sound

5. User settings persistence:
- Chọn A: Frontend-only (localStorage)

## 11. Kế hoạch triển khai theo lựa chọn đã chốt

Mục tiêu triển khai nhanh, rủi ro thấp, không đổi backend:
- Chọn mô hình Hybrid.
- Chỉ bật sound cho INCOMING_CALL + NEW_MESSAGE direct ở Phase 2.
- Group/social sound mặc định OFF.
- Multi-tab leader bắt buộc để chống trùng âm thanh.
- User settings lưu localStorage.

Kỳ vọng:
- Tăng khả năng nhận biết thông báo quan trọng khi OS DND đang bật.
- Giảm nguy cơ làm phiền quá mức nhờ cooldown + policy theo loại event.

## 12. User settings: có cần đổi DB không?

### Câu trả lời ngắn
- Nếu chỉ cần chạy nhanh cho 1 thiết bị/trình duyệt: chỉ frontend là đủ.
- Nếu muốn nhất quán multi-device và cross-browser theo tài khoản: cần backend persistence (DB).

### Option A: Frontend-only (không đổi DB)

Lưu setting tại localStorage, ví dụ:
- `notif_sound_master`
- `notif_sound_call`
- `notif_sound_message_direct`
- `notif_sound_message_group`
- `notif_sound_social`
- `notif_sound_volume`

Ưu điểm:
- Triển khai nhanh, không chạm backend.
- Không migration, không thay đổi API.

Nhược điểm:
- Mỗi thiết bị có cấu hình khác nhau.
- Người dùng đổi máy/trình duyệt sẽ mất setting.

### Option B: Backend-synced (để dành cho giai đoạn mở rộng)

Thêm bảng hoặc cột settings theo user (khuyến nghị bảng riêng):
- `user_notification_preferences`

Field gợi ý:
- `user_id` (PK/FK)
- `sound_master` (bool)
- `sound_incoming_call` (bool)
- `sound_message_direct` (bool)
- `sound_message_group` (bool)
- `sound_social` (bool)
- `sound_volume` (enum/string: low/medium/high)
- timestamps

Backend expose:
- `GET /api/v1/notifications/preferences`
- `PATCH /api/v1/notifications/preferences`

Ưu điểm:
- Đồng bộ theo tài khoản trên mọi thiết bị.
- Dễ phân tích hành vi người dùng ở backend.

Nhược điểm:
- Cần migration + API + cache invalidation.

## 13. Đánh giá breaking change (Frontend + Backend)

### 13.1 Nếu theo khuyến nghị giai đoạn đầu (Hybrid + sound manager + không Quiet hours + frontend-only settings)

Frontend:
- Breaking change: Thấp.
- Rủi ro chính: duplicate sound nếu multi-tab leader chưa chuẩn; có thể giảm bằng BroadcastChannel lock.
- API contract: Không đổi.

Backend:
- Breaking change: Không.
- Không cần đổi schema, không đổi endpoint hiện tại.

Kết luận: phù hợp để rollout nhanh.

### 13.2 Nếu thêm backend-synced settings

Frontend:
- Breaking change: Thấp-Trung bình.
- Cần thêm data-fetch khi app boot + fallback khi API lỗi.

Backend:
- Breaking change: Thấp (nếu làm additive).
- Additive migration (bảng mới hoặc cột mới) + endpoint mới.
- Không ảnh hưởng endpoint cũ nếu không thay contract hiện tại.

Kết luận: không phải breaking nếu triển khai additive và có default an toàn.

### 13.3 Những thứ có thể gây breaking thật sự (nên tránh)

- Đổi format payload push hiện tại mà không backward compatibility ở SW.
- Đổi nghĩa các type hiện có (ví dụ NEW_MESSAGE) khiến client cũ hiểu sai.
- Ép backend yêu cầu field mới bắt buộc trong API cũ.

## 14. Khuyến nghị triển khai thực tế

1. Sprint 1 (an toàn):
- Giữ backend như cũ.
- Làm Notification Sound Manager phía frontend.
- User settings lưu frontend-only.

2. Sprint 2 (nếu cần multi-device consistency):
- Bổ sung backend-synced settings theo hướng additive.
- Frontend ưu tiên đọc backend, fallback local khi lỗi.

Đề xuất chốt: triển khai Option A trước để ra UX nhanh, sau đó nâng cấp Option B khi có nhu cầu đồng bộ tài khoản đa thiết bị.

## 15. Ghi chú mở rộng tương lai

Khi mở rộng tính năng, nên ưu tiên theo thứ tự sau:

1. Đồng bộ setting đa thiết bị (Option B)
- Thêm bảng user_notification_preferences và API GET/PATCH.
- Frontend đọc setting từ backend, fallback local khi lỗi mạng.

2. Cấu hình chi tiết theo subtype của GROUP_EVENT
- Ví dụ: MEMBER_REMOVED có sound, GROUP_UPDATED không sound.

3. Rule nâng cao cho multi-tab
- Leader election với timeout + failover nhanh khi tab leader đóng.
- Đồng bộ cooldown state giữa tab để tránh burst sound khi chuyển leader.

4. Telemetry nâng cao
- Theo dõi tỷ lệ sound bị suppress theo browser/state.
- Theo dõi correlation giữa sound policy và missed call rate.

5. Tối ưu tài nguyên âm thanh
- Preload audio assets theo mức ưu tiên.
- Có cơ chế fallback khi file âm thanh lỗi hoặc bị chặn autoplay.

6. A/B testing policy
- So sánh 2 cấu hình cooldown cho direct message.
- Đánh giá tác động tới complaint rate và retention.
