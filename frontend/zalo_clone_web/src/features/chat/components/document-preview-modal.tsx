import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Spin, Typography } from 'antd';
import mammoth from 'mammoth';
import { FileUtils } from '@/utils/file.utils';

const { Text } = Typography;

interface DocumentPreviewModalProps {
    open: boolean;
    onClose: () => void;
    fileName: string;
    fileUrl?: string | null;
    mimeType?: string | null;
}

function getExtension(fileName: string): string {
    return FileUtils.getExtension(fileName).toLowerCase();
}

function isPdfFile(fileName: string, mimeType?: string | null): boolean {
    return mimeType === 'application/pdf' || getExtension(fileName) === 'pdf';
}

function isDocxFile(fileName: string, mimeType?: string | null): boolean {
    if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
        return true;
    }

    return getExtension(fileName) === 'docx';
}

function sanitizeDocxHtml(rawHtml: string): string {
    return rawHtml
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
        .replace(/\sjavascript:/gi, ' ');
}

export function canPreviewDocument(
    fileName: string,
    mimeType?: string | null,
): boolean {
    return isPdfFile(fileName, mimeType) || isDocxFile(fileName, mimeType);
}

export function DocumentPreviewModal({
    open,
    onClose,
    fileName,
    fileUrl,
    mimeType,
}: DocumentPreviewModalProps) {
    const [loadingDocx, setLoadingDocx] = useState(false);
    const [docxHtml, setDocxHtml] = useState('');
    const [docxError, setDocxError] = useState<string | null>(null);

    const pdf = useMemo(() => isPdfFile(fileName, mimeType), [fileName, mimeType]);
    const docx = useMemo(() => isDocxFile(fileName, mimeType), [fileName, mimeType]);

    useEffect(() => {
        if (!open || !docx || !fileUrl) return;

        let mounted = true;
        setLoadingDocx(true);
        setDocxError(null);
        setDocxHtml('');

        (async () => {
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error(`Không thể tải file DOCX (${response.status})`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                if (!mounted) return;

                setDocxHtml(sanitizeDocxHtml(result.value));
            } catch (error) {
                if (!mounted) return;
                setDocxError(error instanceof Error ? error.message : 'Không thể xem trước DOCX');
            } finally {
                if (mounted) setLoadingDocx(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [open, docx, fileUrl]);

    const renderBody = () => {
        if (!fileUrl) {
            return (
                <Alert
                    type="warning"
                    showIcon
                    message="Tệp không có liên kết xem trước"
                    description="Vui lòng tải xuống để mở bằng ứng dụng ngoài."
                />
            );
        }

        if (pdf) {
            return (
                <iframe
                    src={fileUrl}
                    title={fileName}
                    className="w-full h-[70vh] rounded-md border border-gray-200"
                />
            );
        }

        if (docx) {
            if (loadingDocx) {
                return (
                    <div className="h-[60vh] w-full flex items-center justify-center">
                        <Spin tip="Đang chuyển DOCX..." />
                    </div>
                );
            }

            if (docxError) {
                return <Alert type="error" showIcon message="Không thể hiển thị DOCX" description={docxError} />;
            }

            return (
                <div className="h-[70vh] overflow-y-auto rounded-md border border-gray-200 bg-white p-5">
                    <div
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: docxHtml || '<p>Không có nội dung để hiển thị.</p>' }}
                    />
                </div>
            );
        }

        return (
            <Alert
                type="info"
                showIcon
                message="Định dạng này chưa hỗ trợ xem trước"
                description="Bạn có thể tải xuống tệp để mở bằng ứng dụng tương ứng."
            />
        );
    };

    return (
        <Modal
            title={<Text strong>{fileName}</Text>}
            open={open}
            onCancel={onClose}
            footer={null}
            width={960}
            destroyOnHidden
            centered
        >
            {renderBody()}
        </Modal>
    );
}
