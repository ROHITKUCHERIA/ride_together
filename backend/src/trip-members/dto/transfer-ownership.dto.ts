import { IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  @IsUUID('4', { message: 'newOwnerId must be a valid UUID' })
  newOwnerId!: string;
}
