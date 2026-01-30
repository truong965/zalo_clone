
1. Merge thành UC-FR-06: Block/Unblock Management
2.Missing Critical Edge Cases
2.1 Bi-directional Friend Request Conflict

Các kịch bản trạng thái (A ↔ B)
Trường hợp 1: A gửi cho B khi chưa có quan hệ gì
Phía A (Sender): Trạng thái chuyển thành Request_Sent. A thấy nút "Hủy yêu cầu".

Phía B (Receiver): Trạng thái chuyển thành Request_Received. B thấy nút "Chấp nhận" và "Từ chối".

Logic ngầm: Hệ thống có nên cho phép A "Theo dõi" (Follow) B ngay lập tức không? Thông thường, ở quy mô lớn, gửi kết bạn sẽ tự động tạo một quan hệ A follows B để A thấy nội dung public của B trong khi chờ đợi.

Trường hợp 2: A gửi cho B nhưng B cũng vừa gửi cho A (Double Request)
Đây là case kinh điển dễ gây bug nhất (Race Condition).

Logic: Nếu A gửi cho B trong khi B đã có một yêu cầu chờ xử lý gửi tới A, hệ thống không được tạo thêm bản ghi mới.

Xử lý: Hệ thống tự động chuyển trạng thái thành Friends ngay lập tức.

Lý do: Hành động này thể hiện sự đồng thuận từ cả hai phía. Trải nghiệm người dùng sẽ rất tốt khi họ nhận được thông báo: "Bạn và B đã trở thành bạn bè".

Trường hợp 3: A gửi cho B sau khi đã bị B từ chối (Cooldown)
Logic: Nếu B đã nhấn "Từ chối" (Decline) trước đó, A có được gửi lại không?

Xử lý: Cần một trạng thái Declined kèm timestamp. Hệ thống thường áp dụng Exponential Backoff (ví dụ: lần 1 chờ 24h, lần 2 chờ 7 ngày mới được gửi lại) để chống spam.

2. Tương tác trong "Vùng xám" (Khi chưa là bạn)
Khả năng Chat/Call
Logic 2 chiều:

A (Người gửi): Có được phép nhắn tin cho B ngay khi vừa gửi request không? (Thường cho phép gửi 1 tin nhắn đính kèm request).

B (Người nhận): Nếu B chưa chấp nhận, tin nhắn của A sẽ rơi vào "Message Request" (Tin nhắn chờ). B có thể đọc nhưng A sẽ không thấy trạng thái "Đã xem" cho đến khi B nhấn "Chấp nhận" hoặc "Trả lời".

Call: Tuyệt đối chặn Call từ cả hai phía cho đến khi trạng thái là Friends. Đây là quy tắc bất biến để tránh quấy rối.

Quyền riêng tư (Privacy)
Nếu B để chế độ "Chỉ bạn bè mới được xem số điện thoại/email", thì dù A đã gửi request, A vẫn không được thấy các thông tin này. Chỉ khi trạng thái chuyển sang Friends trên DB thì các field này mới được trả về qua API.

Logic xử lý tại tầng Data & Kiến trúc
Social Graph - Atomic Operation
Việc thay đổi trạng thái bạn bè phải đảm bảo tính Atomic trên 2 bản ghi (hoặc 1 bản ghi đại diện cho cặp A-B):

Nếu dùng SQL: Cần bọc trong một Transaction.

Nếu dùng Graph DB (Neo4j): Tạo edge FRIEND_REQUEST với thuộc tính direction: A->B. Khi accept, xóa edge này và tạo edge FRIEND (vô hướng hoặc 2 hướng).

Tính nhất quán với Messaging
Trường hợp Hủy yêu cầu: Nếu A gửi request + 1 tin nhắn chờ, sau đó A nhấn "Hủy yêu cầu", tin nhắn đó có biến mất khỏi Inbox của B không?

Lựa chọn tốt nhất: Không biến mất, nhưng nút "Chấp nhận kết bạn" trong khung chat của B sẽ biến thành "Gửi lời mời kết bạn" (quay lại trạng thái ban đầu).

Socket & Push Notification
B nhận request: Server gửi socket FRIEND_REQUEST_INCOMING tới B.

A hủy request: Server phải gửi socket CANCEL_FRIEND_REQUEST tới B để app của B xóa thông báo/badge ngay lập tức. Nếu không, B nhấn vào thông báo sẽ gặp lỗi "Request không tồn tại" (Ghost Notification).

Các Bug tiềm năng (Checklist cho Developer)

Double Click: User nhấn nút "Chấp nhận" liên tục. Nếu không xử lý idempotency (tính bù trừ) ở Backend, hệ thống có thể tạo ra các bản ghi trùng lặp hoặc bắn nhiều thông báo "Đã trở thành bạn bè"


The "Block" Flip: A gửi request cho B, sau đó B chặn A. Nếu logic không check kỹ, yêu cầu kết bạn vẫn tồn tại trong DB. Khi B bỏ chặn A, yêu cầu này "sống lại" (Resurrect), gây bối rối cho B.

Mutual Friend Counter: Khi A và B đang Pending, logic đếm số bạn chung (Mutual Friends) có được tính không? (Thường là có, nhưng cần tối ưu query vì đây là phép tính tốn kém $O(N^2)$ ở quy mô lớn).

Inconsistent Cache: User A chấp nhận kết bạn trên Web, nhưng App Mobile của User B (đang mở) vẫn hiện nút "Chấp nhận" do chưa nhận được tín hiệu qua Socket.

2.2 Block Cascading Effects (hãy tập trung vào phần tôi phân tích)


Dưới đây là phân tích chi tiết các kịch bản theo logic 2 chiều:

1. Block trong 1–1 (Mối quan hệ trực tiếp)
Trong kịch bản này, chúng ta định nghĩa A là người thực hiện hành động chặn và B là người bị chặn.

A chủ động tương tác với B (Người chặn → Người bị chặn)
Logic: Không cho phép thực hiện hành động khi đang ở trạng thái chặn.

Xử lý:

Messaging: Khi A mở khung chat với B, input field phải bị khóa kèm dòng chữ: "Bạn đã chặn người này. Bỏ chặn để gửi tin nhắn".

Call: Nút gọi bị vô hiệu hóa hoặc ẩn. Nếu A cố tình gọi qua API trực tiếp, hệ thống trả về lỗi Precondition Failed.

Lý do: Đảm bảo tính nhất quán của trạng thái. Nếu A vẫn có thể nhắn tin cho B, đây là hành vi quấy rối một chiều được hệ thống tiếp tay.

B chủ động tương tác với A (Người bị chặn → Người chặn)
Logic: Hệ thống chặn toàn bộ quyền truy cập tài nguyên của A từ phía B.

Xử lý:

Messaging: B vẫn thấy khung chat (để xem lịch sử cũ) nhưng khi gửi tin nhắn, hệ thống trả về lỗi 403 Forbidden. Tuy nhiên, đề xuất trả lỗi rõ ràng để tránh B thắc mắc tại sao A không trả lời.

Call: Khi B gọi A, hệ thống từ chối ngay tại Signaling Server. Máy B sẽ báo "User Busy" hoặc tự động ngắt sau 1 hồi chuông giả để tránh B biết mình chắc chắn bị chặn.

Lý do: Bảo vệ tài nguyên (băng thông, thông báo) của A. A không bao giờ được nhận bất kỳ tín hiệu nào từ B.

A và B không phải bạn bè (Stranger Block)
Logic: Hệ thống bắt buộc phải cho phép chặn dù chưa là bạn bè.

State cần có: Một bảng/collection Blacklist độc lập với bảng Friendship.

Xử lý: Trạng thái quan hệ giữa A và B sẽ chuyển từ None hoặc Pending Friend sang Blocked.

Lý do: Đây là tính năng an toàn (Safety) cốt lõi để chống spam từ người lạ

Block & Group Logic (Thực thể độc lập)
Group là một "Shared Space", nơi quan hệ 1-1 bị đè lên bởi quan hệ Member-Group.

Tầm ảnh hưởng của Block tới Group Chat
Khả năng nhìn thấy: A và B vẫn thấy tin nhắn của nhau trong Group để đảm bảo mạch hội thoại không bị gãy (Context integrity). Nếu ẩn tin nhắn của B đối với A, A sẽ thấy các thành viên khác đang trả lời một "bóng ma", gây trải nghiệm tồi tệ.

Tương tác phụ: A không thể tag B, không thể Reply trực tiếp tin nhắn của B trong Group.

Logic Check Admin & Member
Kịch bản 1: A (Admin) chặn B (Member):

B vẫn ở trong Group nhưng không thể nhắn tin trực tiếp cho A.

Hệ thống không nên tự động kick B khỏi Group 

Kịch bản 2: B (Member) chặn A (Admin):

B vẫn phải nhận các thông báo/tin nhắn từ Admin A trong phạm vi Group (vì đó là thông tin chung của tổ chức/nhóm). Nếu B không muốn thấy, B phải tự rời Group.

Lý do: Group là thực thể thuộc quyền sở hữu của Admin hoặc tập thể, không phải của cá nhân.

Public Group vs Private Group (Request Join)
Trường hợp User B gửi request join vào Group mà User A (Admin) đã chặn B:

Xử lý (Silent Drop): B vẫn nhấn được nút "Gửi yêu cầu", nhưng yêu cầu này không bao giờ xuất hiện trong danh sách chờ của A.

Lý do: Tránh việc B lợi dụng nút "Join Request" để spam thông báo đến Admin A. Nếu trả về lỗi "Bạn bị Admin chặn", B sẽ biết mình bị chặn và có thể dùng tài khoản clone để quấy phá.

Tính nhất quán dữ liệu (Data Consistency)
Quyết định về logic ở trên ảnh hưởng trực tiếp đến kiến trúc hệ thống như sau:

Social Graph
Atomic Transition: Khi CreateBlock(A, B) thành công, hệ thống phải kích hoạt một job để DeleteFriendship(A, B) và CancelPendingRequest(A, B). Không được tồn tại trạng thái vừa là bạn vừa chặn nhau.

Messaging
Inbox Sorting: Khi A chặn B, bản ghi Conversation giữa A-B phải được đánh dấu ẩn (is_hidden: true) trên UI của A nhưng vẫn giữ is_hidden: false trên UI của B (trừ khi B cũng chặn A).

Message Security: Phải check quyền ở tầng Write-path. API Server phải truy vấn Redis BlockSet trước khi cho phép lưu tin nhắn vào Database.

Call
Signaling Guard: Khi một cuộc gọi được khởi tạo, Signaling Server phải kiểm tra BlockState từ Redis. Nếu tồn tại, phải từ chối cấp WebRTC Candidate.

Active Session Tear-down: Nếu hành động chặn xảy ra khi đang call, hệ thống phải dùng Socket Pub/Sub để gửi lệnh KILL_SESSION tới cả hai client.

Socket / Redis StatePresence Invisibility: Khi A chặn B, hệ thống phải lọc B ra khỏi danh sách nhận PresenceUpdate (Online/Offline) của A.Redis Schema: Sử dụng SET trong Redis cho mỗi User: user:{id}:blocklist.Khi A chặn B: SADD user:A:blocklist B.Tốc độ check là $O(1)$, đảm bảo latency cực thấp cho mọi request chat/call.

Điểm yếu tiềm năng (Bugs) cần lưu ý:

Race Condition: B nhanh tay gửi tin nhắn đúng lúc A đang nhấn nút Block. Tin nhắn lọt vào DB nhưng Socket thông báo chặn chưa tới.

Admin Blind Spot: Admin chặn một user nhưng quên không chặn quyền "Invite to Group" của user đó, dẫn đến user bị chặn vẫn add được Admin vào các group rác.

Distributed Cache Lag: Database đã ghi nhận Block nhưng Redis node ở khu vực khác chưa update, dẫn đến việc chặn có độ trễ giữa các vùng địa lý.

Tổng hợp các lỗi kỹ thuật kinh điển (Checklist khi Code)
Chênh lệch múi giờ/Clock Skew: Lệnh chặn ghi nhận lúc 10:00 nhưng tin nhắn gửi lúc 10:00:01 lại có timestamp DB là 09:59:59 (do lệch clock giữa các server), dẫn đến tin nhắn vẫn hiển thị "trước" khi chặn.

Pagination Gap: Khi A chặn B, danh sách Inbox của A bị mất 1 bản ghi. Nếu không xử lý offset cẩn thận, khi A kéo xuống (Load more), một cuộc gọi API sẽ bị trùng hoặc mất tin nhắn của người khác.

Atomic Operations: Thực hiện Unfriend và Block không nằm trong một database transaction. DB chết giữa chừng khiến A và B không còn là bạn nhưng lệnh Block chưa được ghi.


