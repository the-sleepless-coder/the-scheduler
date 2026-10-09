import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Repository } from 'typeorm';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { MindTopic } from './mind-topic.entity';

class CreateMindTopicDto {
  // 'YYYY-MM'(월간) 또는 'YYYY-MM-DD'(주간, 월요일)
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/)
  month: string;

  @IsString()
  @MaxLength(100)
  name: string;
}

class UpdateMindTopicDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isFolder?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string | null;
}

type AuthedRequest = { user: JwtPayload };

@Controller('mind-topics')
@UseGuards(JwtAuthGuard)
export class MindTopicsController {
  constructor(
    @InjectRepository(MindTopic)
    private readonly topics: Repository<MindTopic>,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('month') month: string) {
    return this.topics.find({
      where: { userId: req.user.sub, month },
      order: { createdAt: 'ASC' },
    });
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateMindTopicDto) {
    return this.topics.save(
      this.topics.create({ ...dto, userId: req.user.sub }),
    );
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMindTopicDto,
  ) {
    const topic = await this.topics.findOne({
      where: { id, userId: req.user.sub },
    });
    if (!topic) throw new NotFoundException('주제를 찾을 수 없습니다.');
    Object.assign(topic, dto);
    return this.topics.save(topic);
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const topic = await this.topics.findOne({
      where: { id, userId: req.user.sub },
    });
    if (topic) await this.topics.softRemove(topic);
    return { ok: true };
  }
}
