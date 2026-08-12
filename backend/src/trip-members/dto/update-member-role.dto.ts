import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { MemberRole } from '../../../generated/prisma/enums';

export class UpdateMemberRoleDto {
  @IsEnum(MemberRole, { message: 'role must be ADMIN or MEMBER' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  role!: MemberRole;
}
