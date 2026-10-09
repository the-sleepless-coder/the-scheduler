import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export class CreateTaskDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @Matches(DATE_PATTERN, { message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' })
  date: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string;

  // 타임박스 블록 복사본이면 원본 할일 id
  @IsOptional()
  @IsInt()
  parentTaskId?: number;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsBoolean()
  isChore?: boolean;

  @IsOptional()
  @IsBoolean()
  highPriority?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  top3Order?: number | null;

  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  memo?: string | null;

  @IsOptional()
  @IsInt()
  subItemId?: number | null;
}
