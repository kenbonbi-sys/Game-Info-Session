import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, parseRoster, buildIndex, lookup, search, loginKey, REWARD_DAY } from '../src/identity.js';

test('domain nào gõ ra cũng về một khoá', () => {
  const same = [
    'khang.pham2',
    ' khang.pham2 ',
    'Khang.Pham2',
    'KHANG.PHAM2@MSERVICE.COM.VN',
    'khang.pham2@momo.com.vn',
    'khang.phạm2',
    'khang pham2',
    'khang..pham2.',
    '@khang.pham2',
    'khang.pham2 🎉',
  ];
  for (const raw of same) assert.equal(normalizeDomain(raw), 'khang.pham2', raw);
  assert.equal(normalizeDomain(''), '');
  assert.equal(normalizeDomain('   '), '');
  assert.equal(normalizeDomain('🎉'), '');
  assert.equal(normalizeDomain(null), '');
  assert.equal(normalizeDomain('ĐỨC.anh'), 'duc.anh');
  assert.equal(normalizeDomain('x'.repeat(60)).length, 40);
});

test('đọc được bản xuất CSV có tiêu đề', () => {
  const { people, columns } = parseRoster([
    'Employee Name,Email Address,Department',
    'Phạm Khang,khang.pham2@mservice.com.vn,Learning Hub',
    '"Nguyễn, Thanh Hương",huong.nguyen@momo.com.vn,Research Lab',
  ].join('\n'));
  assert.equal(columns.mail, 1);
  assert.equal(columns.name, 0);
  assert.equal(columns.unit, 2);
  assert.equal(people.length, 2);
  assert.equal(people[0].domain, 'khang.pham2');
  assert.equal(people[0].email, 'khang.pham2@mservice.com.vn');
  assert.equal(people[0].name, 'Phạm Khang');
  assert.equal(people[0].unit, 'Learning Hub');
  assert.equal(people[1].domain, 'huong.nguyen');
  assert.equal(people[1].name, 'Nguyễn, Thanh Hương');
});

test('đọc được bản dán thẳng từ Excel và cột địa chỉ trần', () => {
  const tsv = parseRoster('khang.pham2@momo.com.vn\tPhạm Khang\nhuong.nguyen@momo.com.vn\tHương Nguyễn');
  assert.deepEqual(tsv.people.map(p => p.domain), ['khang.pham2', 'huong.nguyen']);
  assert.equal(tsv.people[0].name, 'Phạm Khang');

  const bare = parseRoster('khang.pham2@momo.com.vn\nhuong.nguyen@mservice.com.vn\n\n');
  assert.deepEqual(bare.people.map(p => p.domain), ['khang.pham2', 'huong.nguyen']);

  const logins = parseRoster('khang.pham2\nhuong.nguyen');
  assert.deepEqual(logins.people.map(p => p.email), ['khang.pham2@mservice.com.vn', 'huong.nguyen@mservice.com.vn']);

  const angle = parseRoster('Phạm Khang <khang.pham2@momo.com.vn>');
  assert.equal(angle.people[0].domain, 'khang.pham2');
  assert.equal(angle.people[0].name, 'Phạm Khang');
});

test('bỏ dòng rác và dòng trùng thay vì hỏng cả danh sách', () => {
  const { people, skipped, duplicates } = parseRoster([
    'email,name',
    'khang.pham2@momo.com.vn,Khang',
    ',Không có địa chỉ',
    'KHANG.PHAM2@mservice.com.vn,Khang lần hai',
    'huong.nguyen@momo.com.vn,Hương',
  ].join('\n'));
  assert.deepEqual(people.map(p => p.domain), ['khang.pham2', 'huong.nguyen']);
  assert.equal(skipped, 1);
  assert.equal(duplicates, 1);
});

const index = buildIndex(parseRoster([
  'email,name',
  'khang.pham2@momo.com.vn,Phạm Khang',
  'huong.nguyen@momo.com.vn,Nguyễn Hương',
  'duc.anh@mservice.com.vn,Đức Anh',
].join('\n')).people);

test('dò đúng người, và chịu thua đúng lúc', () => {
  assert.equal(lookup(index, 'khang.pham2').how, 'exact');
  assert.equal(lookup(index, 'KHANG.PHAM2@momo.com.vn ').person.name, 'Phạm Khang');
  // Thiếu dấu chấm vẫn ra đúng người vì không ai khác trùng khoá.
  const noDot = lookup(index, 'khangpham2');
  assert.equal(noDot.how, 'key');
  assert.equal(noDot.person.domain, 'khang.pham2');
  // Lệch một ký tự: không tự nhận bừa, chỉ gợi ý.
  const near = lookup(index, 'khang.pham3');
  assert.equal(near.how, 'near');
  assert.equal(near.person, null);
  assert.deepEqual(near.near.map(p => p.domain), ['khang.pham2']);
  // Không liên quan gì thì im lặng, không bới cả danh sách ra.
  assert.deepEqual(lookup(index, 'zzz.quoc.te').near, []);
  assert.equal(lookup(index, '').how, 'empty');
  assert.equal(lookup(buildIndex([]), 'khang.pham2').how, 'off');
});

test('hai người cùng khoá thì hỏi lại chứ không đoán', () => {
  const two = buildIndex([
    { domain: 'duc.anh', email: 'duc.anh@momo.com.vn', name: 'Đức Anh', unit: '' },
    { domain: 'ducanh', email: 'ducanh@momo.com.vn', name: 'Đức Anh (nhà máy)', unit: '' },
  ]);
  assert.equal(loginKey('duc.anh'), loginKey('ducanh'));
  const hit = lookup(two, 'duc-anh');
  assert.equal(hit.how, 'ambiguous');
  assert.equal(hit.person, null);
  assert.equal(hit.near.length, 2);
  // Gõ đúng y hệt một trong hai thì vẫn ra người đó, không bị mập mờ.
  assert.equal(lookup(two, 'ducanh').how, 'exact');
});

test('ô gợi ý của MC tìm được cả theo tên lẫn theo địa chỉ', () => {
  assert.deepEqual(search(index, 'khang').map(p => p.domain), ['khang.pham2']);
  assert.deepEqual(search(index, 'Hương').map(p => p.domain), ['huong.nguyen']);
  assert.deepEqual(search(index, 'nguyen').map(p => p.domain), ['huong.nguyen']);
  assert.equal(search(index, '').length, 3);
});

test('phần thưởng suy từ số ngày đăng nhập và cột bảng câu hỏi', () => {
  const { people, rewards, columns } = parseRoster([
    'Email,Họ tên,Số ngày đăng nhập,Đã tạo bảng câu hỏi',
    'a.one@momo.com.vn,Một,7,x',
    'b.two@momo.com.vn,Hai,5,',
    'c.three@momo.com.vn,Ba,3,có',
    'd.four@momo.com.vn,Bốn,2,không',
    'e.five@momo.com.vn,Năm,0,',
  ].join('\n'));
  assert.equal(rewards, true);
  assert.equal(columns.days, 2);
  assert.equal(columns.quiz, 3);
  assert.deepEqual(REWARD_DAY, { hint: 3, boost: 5 });
  const got = Object.fromEntries(people.map(p => [p.domain, p.items]));
  // 7 ngày + có tạo bảng câu hỏi = đủ ba món.
  assert.deepEqual(got['a.one'], { hint: 1, shield: 1, boost: 1 });
  // Ngày 5 mở Súng, nhưng không tạo bảng câu hỏi thì không có Khiên.
  assert.deepEqual(got['b.two'], { hint: 1, shield: 0, boost: 1 });
  // Ngày 3 mới đủ Buddy; "có" ở cột bảng câu hỏi là có Khiên.
  assert.deepEqual(got['c.three'], { hint: 1, shield: 1, boost: 0 });
  // Ngày 2 chưa tới mốc nào, và "không" là không.
  assert.deepEqual(got['d.four'], { hint: 0, shield: 0, boost: 0 });
  assert.deepEqual(got['e.five'], { hint: 0, shield: 0, boost: 0 });
});

test('cột vật phẩm dev tính sẵn thì nghe cột đó, không suy lại từ ngày', () => {
  const { people, rewards } = parseRoster([
    'email,so ngay,Buddy thong thai,Khien,Sung giot tu tin',
    'a.one@momo.com.vn,0,1,1,1',
    'b.two@momo.com.vn,7,0,0,0',
  ].join('\n'));
  assert.equal(rewards, true);
  assert.deepEqual(people[0].items, { hint: 1, shield: 1, boost: 1 });
  assert.deepEqual(people[1].items, { hint: 0, shield: 0, boost: 0 });
});

test('bản xuất chỉ có tên thì báo là không có cột phần thưởng', () => {
  const { people, rewards } = parseRoster('khang.pham2@momo.com.vn\nhuong.nguyen@momo.com.vn');
  assert.equal(rewards, false);
  assert.equal(people[0].days, null);
  // Không có cột nào để suy: server sẽ phát đủ 3 món cho ai có tên trong danh sách.
  assert.deepEqual(people[0].items, { hint: 0, shield: 0, boost: 0 });
});
