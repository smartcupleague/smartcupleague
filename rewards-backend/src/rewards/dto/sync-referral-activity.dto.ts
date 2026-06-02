import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SyncReferralActivityDto {
  @IsString()
  @MaxLength(128)
  friend: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  betCount: number;

  @IsInt()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  activeDays?: number;

  @IsInt()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  qualifyingActiveDays?: number;

  @IsOptional()
  @IsDateString()
  firstTxAt?: string;

  @IsOptional()
  @IsDateString()
  lastTxAt?: string;
}
