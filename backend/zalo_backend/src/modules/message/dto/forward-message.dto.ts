import {
    ArrayMaxSize,
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

export class ForwardMessageDto {
    @IsString()
    @IsNotEmpty()
    sourceMessageId!: string;

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(5)
    @IsUUID('4', {
        each: true,
        message: 'targetConversationIds must contain valid UUIDs',
    })
    targetConversationIds!: string[];

    @IsUUID()
    @IsNotEmpty()
    clientRequestId!: string;

    @IsOptional()
    @IsBoolean()
    includeCaption?: boolean;
}
