import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { CreateTaskDto, UpdateTaskDto } from './tasks.dto';
import { TasksService } from './tasks.service';

type AuthedRequest = { user: JwtPayload };

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('date') date: string) {
    return this.tasks.findByDate(req.user.sub, date);
  }

  @Get('categories')
  categories(@Req() req: AuthedRequest, @Query('month') month?: string) {
    return this.tasks.categories(req.user.sub, month);
  }

  @Get('range')
  range(
    @Req() req: AuthedRequest,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.tasks.findByRange(req.user.sub, from, to);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateTaskDto) {
    return this.tasks.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.remove(req.user.sub, id);
  }
}
