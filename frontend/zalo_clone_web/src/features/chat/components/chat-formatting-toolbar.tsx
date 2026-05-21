import { Editor } from '@tiptap/react';
import { Button, Tooltip, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  FontColorsOutlined,
  FontSizeOutlined,
  ClearOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  UndoOutlined,
  RedoOutlined,
  MoreOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface ChatFormattingToolbarProps {
  editor: Editor | null;
}

export function ChatFormattingToolbar({ editor }: ChatFormattingToolbarProps) {
  const { t } = useTranslation();

  if (!editor) {
    return null;
  }

  const handleDropdownClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
      case 'undo':
        editor.chain().focus().undo().run();
        break;
      case 'redo':
        editor.chain().focus().redo().run();
        break;
      case 'outdent':
        editor.chain().focus().liftListItem('listItem').run();
        break;
    }
  };

  const currentFontSize = editor.getAttributes('textStyle').fontSize;
  const isLarge = currentFontSize === '18px';
  const isSmall = currentFontSize === '13px';
  const isMedium = !isLarge && !isSmall;

  const fontSizeItems: MenuProps['items'] = [
    { key: '18px', label: 'Lớn', style: { fontSize: '18px' }, icon: isLarge ? <CheckOutlined /> : <span style={{ width: 14, display: 'inline-block' }} /> },
    { key: '15px', label: 'Trung bình', style: { fontSize: '15px' }, icon: isMedium ? <CheckOutlined /> : <span style={{ width: 14, display: 'inline-block' }} /> },
    { key: '13px', label: 'Nhỏ', style: { fontSize: '13px' }, icon: isSmall ? <CheckOutlined /> : <span style={{ width: 14, display: 'inline-block' }} /> },
  ];

  const handleFontSizeClick: MenuProps['onClick'] = ({ key }) => {
    editor.chain().focus().setFontSize(key).run();
  };

  const moreItems: MenuProps['items'] = [
    {
      key: 'outdent',
      icon: <MenuFoldOutlined />,
      label: 'Bỏ lùi đầu dòng (Shift + Tab)',
      disabled: !editor.can().liftListItem('listItem'),
    },
    {
      key: 'undo',
      icon: <UndoOutlined />,
      label: 'Hoàn tác (Ctrl + Z)',
      disabled: !editor.can().undo(),
    },
    {
      key: 'redo',
      icon: <RedoOutlined />,
      label: 'Khôi phục hoàn tác (Ctrl + Y)',
      disabled: !editor.can().redo(),
    },
  ];

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 flex-wrap">
      <Tooltip title="In đậm (Ctrl + B)" placement="top">
        <Button
          type="text"
          icon={<BoldOutlined />}
          className={`w-8 h-8 flex items-center justify-center rounded ${editor.isActive('bold') ? 'bg-gray-200 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
      </Tooltip>
      <Tooltip title="In nghiêng (Ctrl + I)" placement="top">
        <Button
          type="text"
          icon={<ItalicOutlined />}
          className={`w-8 h-8 flex items-center justify-center rounded ${editor.isActive('italic') ? 'bg-gray-200 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
      </Tooltip>
      <Tooltip title="Gạch chân (Ctrl + U)" placement="top">
        <Button
          type="text"
          icon={<UnderlineOutlined />}
          className={`w-8 h-8 flex items-center justify-center rounded ${editor.isActive('underline') ? 'bg-gray-200 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
      </Tooltip>
      <Tooltip title="Gạch ngang" placement="top">
        <Button
          type="text"
          icon={<StrikethroughOutlined />}
          className={`w-8 h-8 flex items-center justify-center rounded ${editor.isActive('strike') ? 'bg-gray-200 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
      </Tooltip>

      <div className="w-[1px] h-4 bg-gray-300 mx-1" />

      <Tooltip title="Màu chữ" placement="top">
        <Button
          type="text"
          icon={<FontColorsOutlined />}
          className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded"
          onClick={() => {
            // Simplified: toggle primary color or reset
            if (editor.isActive('textStyle', { color: '#005ae0' })) {
              editor.chain().focus().unsetColor().run();
            } else {
              editor.chain().focus().setColor('#005ae0').run();
            }
          }}
        />
      </Tooltip>

      <Dropdown menu={{ items: fontSizeItems, onClick: handleFontSizeClick }} trigger={['click']} placement="top">
        <Tooltip title="Cỡ chữ" placement="top">
          <Button
            type="text"
            icon={<FontSizeOutlined />}
            className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded"
          />
        </Tooltip>
      </Dropdown>

      <Tooltip title="Xóa định dạng" placement="top">
        <Button
          type="text"
          icon={<ClearOutlined />}
          className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded"
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
        />
      </Tooltip>

      <div className="w-[1px] h-4 bg-gray-300 mx-1" />

      <Tooltip title="Danh sách dấu chấm" placement="top">
        <Button
          type="text"
          icon={<UnorderedListOutlined />}
          className={`w-8 h-8 flex items-center justify-center rounded ${editor.isActive('bulletList') ? 'bg-gray-200 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
      </Tooltip>
      <Tooltip title="Danh sách đánh số" placement="top">
        <Button
          type="text"
          icon={<OrderedListOutlined />}
          className={`w-8 h-8 flex items-center justify-center rounded ${editor.isActive('orderedList') ? 'bg-gray-200 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </Tooltip>
      <Tooltip title="Lùi đầu dòng danh sách con (Tab)" placement="top">
        <Button
          type="text"
          icon={<MenuUnfoldOutlined />}
          className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded"
          disabled={!editor.can().sinkListItem('listItem')}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        />
      </Tooltip>

      <Dropdown menu={{ items: moreItems, onClick: handleDropdownClick }} trigger={['click']} placement="topRight">
        <Button
          type="text"
          icon={<MoreOutlined />}
          className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 w-8 h-8 flex items-center justify-center rounded ml-auto"
        />
      </Dropdown>
    </div>
  );
}
