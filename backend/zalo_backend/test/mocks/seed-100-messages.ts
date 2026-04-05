// npx dotenv -e .env.development.local -- npx ts-node test/mocks/seed-100-messages.ts

import 'dotenv/config';
import {
      PrismaClient,
      Prisma,
      UserStatus,
      MemberRole,
      MemberStatus,
      ConversationType,
      MessageType,
      PrivacyLevel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fakerVI as faker } from '@faker-js/faker';

// Setup Prisma
if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const CONV_ID = '32cb3ae2-5fa9-42d4-9036-233651bd0edb';

async function main() {
      try {
            await prisma.$connect();
            console.log('🚀 Starting fake message generation...');

            // 1. Get/Create Users
            let users = await prisma.user.findMany({
                  where: { status: UserStatus.ACTIVE },
                  take: 6
            });

            if (users.length < 6) {
                  console.log('Not enough users, finding more or creating...');
                  // Just take any users available
                  users = await prisma.user.findMany({ take: 10 });
            }

            // 2. Setup Conversation
            let conv = await prisma.conversation.findUnique({
                  where: { id: CONV_ID },
                  include: { members: true }
            });

            if (!conv) {
                  console.log('Creating conversation...');
                  conv = await prisma.conversation.create({
                        data: {
                              id: CONV_ID,
                              type: ConversationType.GROUP,
                              name: 'Zalo Clone - Team Chiến 3 Tháng',
                              participants: users.map(u => u.id),
                              members: {
                                    create: users.map((u, i) => ({
                                          userId: u.id,
                                          role: i === 0 ? MemberRole.ADMIN : MemberRole.MEMBER,
                                          status: MemberStatus.ACTIVE
                                    }))
                              }
                        },
                        include: { members: true }
                  });
            } else {
                  // Ensure these users are members
                  for (const u of users) {
                        const isMember = conv.members.some(m => m.userId === u.id);
                        if (!isMember) {
                              await prisma.conversationMember.create({
                                    data: {
                                          conversationId: CONV_ID,
                                          userId: u.id,
                                          role: MemberRole.MEMBER,
                                          status: MemberStatus.ACTIVE
                                    }
                              }).catch(() => { });
                        }
                  }
            }

            // Define Personalities
            // Admin: Boss
            // Member 1: Tech Lead (Strict)
            // Member 2: Dev (Silly, many slang)
            // Member 3: UI/UX (Detail oriented)
            // Member 4: Random/Casual (Talks about life)
            // Member 5: The "Wrong Suggestion" guy

            const specificMessages = [
                  { u: 0, c: "Chào ae, dự án Zalo Clone 3 tháng bắt đầu từ hôm nay nhé. Căng đấy!" },
                  { u: 1, c: "3 tháng mà clone toàn bộ Zalo? Boss đùa à? Ít nhất cũng phải 6 tháng mới hđ ổn định đc." },
                  { u: 2, c: "Vcl, 3 tháng thì code quay tay à ae? Ảo ma Canada thật sự." },
                  { u: 5, c: "Theo em thì mình cứ dùng PHP thuần viết cho nhanh, khỏi framework chi cho mệt." },
                  { u: 1, c: "Ông ngáo à? PHP thuần giờ này ai dùng làm app real-time? Socket đồ các thứ nữa." },
                  { u: 3, c: "UI thì em thấy cứ bê nguyên xi Zalo qua là xong, đỡ phải nghĩ." },
                  { u: 2, c: "Bê nguyên xi là ăn gậy bản quyền đấy bà nội. Đổi màu xíu đi." },
                  { u: 4, c: "Hôm qua tôi đi xem phim với người yêu mà thấy phim Dune 2 cuốn vãi, ae xem chưa?" },
                  { u: 0, c: "Ông 4 ơi, đang họp mà phim ảnh gì. Tập trung cái module Message dùm tui." },
                  { u: 4, c: "Thì tui kể tí cho bớt stress thôi mà Boss. Căng như dây đàn." },
                  { u: 1, c: "Tui đề xuất dùng NestJS + Socket.io cho backend. AE thấy sao?" },
                  { u: 2, c: "Okela, NestJS thì dduocj, tui rành cái đó." },
                  { u: 5, c: "Sao ko dùng WordPress? Có plugin chat mà." },
                  { u: 1, c: "..." },
                  { u: 2, c: "Ông 5 bớt tấu hài hộ cái, WordPress làm sập server đó." },
                  { u: 0, c: "Chốt NestJS nhé. Mobile thì sao?" },
                  { u: 3, c: "Flutter đi Boss, code một lần chạy cả iOS lẫn Android cho lẹ." },
                  { u: 1, c: "Flutter thì hiệu năng ko bằng Native nhưng 3 tháng thì chắc chỉ có nước đó." },
                  { u: 5, c: "Dùng React Native đi, em thấy nó dễ hơn." },
                  { u: 2, c: "React Native cũng đc, nhưng mấy cái gesture của nó hơi lỏ." },
                  { u: 4, c: "Tui mới thấy em nhân viên mới xịn vcl ae ạ, tí chụp cho xem." },
                  { u: 0, c: "Tập trung!!!" },
                  { u: 4, c: "Ok Boss, sorry ae." },
                  { u: 3, c: "Figma em cập nhật rồi đấy, ae vào soi đi nhé. Đẹp rụng rời." },
                  { u: 2, c: "Màu này hơi tối nhỉ? Zalo nó sáng trưng mà." },
                  { u: 3, c: "Dark mode là xu hướng mà ông ơi. Kệ đi." },
                  { u: 1, c: "Deploy staging tối nay nhé. Tui mới setup xong CI/CD." },
                  { u: 2, c: "Ghê đấy, Lead có khác. Hết nước chấm." },
                  { u: 5, c: "Deploy lên Google Drive cho tiện ae tải về test." },
                  { u: 2, c: "Wtf? Google Drive? Thôi ông ngủ đi cho khỏe." },
                  { u: 4, c: "Bồ tui đòi đi Đà Lạt, dự án này mà xong Boss cho tui nghỉ phép 1 tuần nhé." },
                  { u: 0, c: "Xong đúng deadline thì nghỉ 2 tuần cũng đc." },
                  { u: 2, c: "Hứa nha Boss, chụp màn hình lại làm bằng chứng nè." },
                  { u: 1, c: "Lag quá ae ơi, server đang bị gì à?" },
                  { u: 2, c: "Chắc do ông 5 đang upload tài liệu lên Google Drive đấy." },
                  { u: 5, c: "Hì hì, em test tí mà." },
                  { u: 3, c: "Layout này bị vỡ trên iPhone 15 này ae, fix dùm cái." },
                  { u: 1, c: "Để tui check lại CSS." },
                  { u: 4, c: "Đói bụng quá, có ai order gà rán ko?" },
                  { u: 2, c: "1 slot nha mlem mlem." },
                  { u: 0, c: "Dự án mới chạy 2 tuần mà ae lỏng lẻo quá. Cố lên chứ." },
                  { u: 1, c: "Sắp tới phần encrypted message rồi, cái này khoai nhất." },
                  { u: 5, c: "E2EE hả? Cứ base64 là xong mà?" },
                  { u: 1, c: "Base64 là encode, ko phải encrypt. Lạy ông." },
                  { u: 2, c: "Ông 5 đúng là chúa tể của những gợi ý sai lệch luôn á." },
                  { u: 3, c: "Avatar mặc định dùng cái gì ae? Hình con mèo nhé?" },
                  { u: 4, c: "Đúng rồi, tui thích mèo. Mèo méo meo." },
                  { u: 0, c: "Dùng logo dự án đi cho chuyên nghiệp." },
                  { u: 2, c: "Boss khó tính vcl." },
                  { u: 0, c: "Tui nghe đấy nhé." },
                  { u: 2, c: "Hehe đùa tí mà Boss." },
                  { u: 4, c: "Nay tui thấy trên mạng có vụ này hot lắm, gửi ae xem link bên dưới." },
                  { u: 1, c: "Thôi đừng spam link tinh linh ông ơi." },
                  { u: 3, c: "Search tin nhắn đang bị chậm. AE coi lại index DB nhé." },
                  { u: 1, c: "Để tui add thêm GIN index cho Postgres." },
                  { u: 5, c: "Hay là mình lưu tin nhắn vào file .txt cho dễ search?" },
                  { u: 2, c: "Cái này thì tui quỳ luôn, ko còn gì để nói." },
                  { u: 0, c: "Cấm ông 5 phát biểu 10 phút." },
                  { u: 5, c: "🥺" },
                  { u: 4, c: "Mọi người có ai bị sếp tổng gọi lên chưa?" },
                  { u: 0, c: "Tui mới bị nè. Đang hỏi tiến độ." },
                  { u: 1, c: "Căng như dây đàn. AE debug nốt module Call đi." },
                  { u: 2, c: "Cái WebRTC này nó cứ bị drop connection miết." },
                  { u: 3, c: "Chắc do mạng công ty lỏ đấy." },
                  { u: 5, c: "Dùng Skype cho nhanh ae." },
                  { u: 1, c: "..." },
                  { u: 2, c: "Hết 10 phút rồi à? Nhanh thế." },
                  { u: 4, c: "Tối nay ae đi nhậu ko? Giải xui đi." },
                  { u: 0, c: "Nhậu xong mai ngủ nướng thì ai code?" },
                  { u: 4, c: "Thì nhậu nhẹ thôi Boss." },
                  { u: 2, c: "Tui đi! Nhất trí!" },
                  { u: 1, c: "Tui bận fix bug rồi, ko đi đc." },
                  { u: 3, c: "Bác Lead chăm chỉ quá, ngưỡng mộ vcl." },
                  { u: 5, c: "Em cũng đi, em biết quán này ngon lắm." },
                  { u: 1, c: "Ông 5 đi để ae còn yên tâm làm việc." },
                  { u: 2, c: "Ác thế nhờ." },
                  { u: 0, c: "Sắp tới hạn nộp demo cho khách rồi, check lại luồng login bằng QR nhé." },
                  { u: 2, c: "QR chạy ngon rồi Boss, tui mới test xong." },
                  { u: 4, c: "Hôm qua tui quét mã QR ở quán cafe mà nó ra link lừa đảo, suýt mất tiền." },
                  { u: 1, c: "Thế thì ông cẩn thận đi nhé." },
                  { u: 3, c: "Animation lúc gửi tin nhắn hơi giật. AE mượt hóa nó xíu." },
                  { u: 2, c: "Ok để tui thêm Reanimated vào cho nó luột." },
                  { u: 5, c: "Hay là dùng GIF cho nó nhanh?" },
                  { u: 1, c: "Lại là ông 5..." },
                  { u: 0, c: "Mệt mỏi với ông 5 thật sự." },
                  { u: 4, c: "Hôm nay trời đẹp nhỉ, ước gì đc đi biển." },
                  { u: 2, c: "Biển xanh vẫy gọi, code đang vẫy tay chào." },
                  { u: 3, c: "Mọi người có thấy Zalo mới update ko? Cái icon nó đổi rồi kìa." },
                  { u: 1, c: "Kệ họ đi, mình lo app mình đã." },
                  { u: 0, c: "Đúng rồi, copy nhưng phải có chất riêng." },
                  { u: 2, c: "Chất riêng của mình là nhiều bug hơn hả Boss? Hehe." },
                  { u: 0, c: "Vả cho giờ." },
                  { u: 4, c: "Ê ae, mai sinh nhật tui, buff tui ít code đi." },
                  { u: 1, c: "Chúc mừng sinh nhật trước nhé, nhưng code thì vẫn phải nộp." },
                  { u: 3, c: "SN vui vẻ nhé ông 4." },
                  { u: 5, c: "Tặng ông cái link Google Drive tài liệu quý nè." },
                  { u: 2, c: "Check link cẩn thận nha ae, coi chừng virus." },
                  { u: 0, c: "Thôi kết thúc họp ở đây, ae cày tiếp nhé." },
                  { u: 1, c: "G9 ae." },
                  { u: 2, c: "Ngủ ngon ae, tui cày nốt ván game rồi ngủ." },
                  { u: 4, c: "Mơ thấy bug nhé ae." },
            ];

            const messageEntries: Prisma.MessageCreateManyInput[] = [];
            let currentTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Start 1 week ago to feel current

            for (let i = 0; i < 100; i++) {
                  // Distribution: first 100 messages use the specific list, if more needed, random
                  const data = specificMessages[i % specificMessages.length];
                  const sender = users[data.u % users.length];

                  // Add a few minutes/hours to each message
                  currentTime = new Date(currentTime.getTime() + faker.number.int({ min: 1000 * 60 * 5, max: 1000 * 60 * 60 * 12 }));

                  messageEntries.push({
                        conversationId: CONV_ID,
                        senderId: sender.id,
                        type: MessageType.TEXT,
                        content: data.c,
                        createdAt: currentTime,
                        clientMessageId: faker.string.uuid(),
                  });
            }

            // Shuffle slightly to feel natural? No, keep the order of conversation.

            await prisma.message.createMany({ data: messageEntries });
            console.log(`✅ Successfully generated 100 messages for conversation ${CONV_ID}!`);

      } catch (error) {
            console.error('❌ Error during message generation:', error);
      } finally {
            await prisma.$disconnect();
      }
}

main();
