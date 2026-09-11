import { describe, it, expect } from 'vitest';
import {
  extractClarificationChoices,
  filterGroundedClarifications,
  isClarificationAlreadyGrounded,
} from '../PlannerAgent/application/clarificationFilter';

describe('clarificationFilter', () => {
  it('从「A 还是 B」问句抽出候选项', () => {
    expect(extractClarificationChoices('请问是 YouTube 还是 Bilibili？')).toEqual([
      'YouTube',
      'Bilibili',
    ]);
    expect(extractClarificationChoices('YouTube or Bilibili')).toEqual([
      'YouTube',
      'Bilibili',
    ]);
  });

  it('上下文已有 YouTube 时丢掉平台选择题', () => {
    const grounded = '用户此前在讨论 YouTube 上最近的热门视频';
    expect(isClarificationAlreadyGrounded('请问是 YouTube 还是 Bilibili？', grounded)).toBe(true);
    expect(isClarificationAlreadyGrounded('请问视频来自哪个平台？', grounded)).toBe(true);

    expect(filterGroundedClarifications(
      [
        { question: '请问是 YouTube 还是 Bilibili？', domain: '平台' },
        { question: '请问保存到哪个文件夹？', domain: '路径' },
      ],
      grounded,
    )).toEqual([{ question: '请问保存到哪个文件夹？', domain: '路径' }]);
  });

  it('本句已写明 YouTube 时不再问平台', () => {
    expect(isClarificationAlreadyGrounded(
      '请问是 YouTube 还是 Bilibili？',
      '帮我爬取 YouTube 前十浏览量视频',
    )).toBe(true);
  });

  it('语义模糊且无上下文时保留澄清题', () => {
    expect(isClarificationAlreadyGrounded(
      '请问是 YouTube 还是 Bilibili？',
      '把前十浏览量的视频链接爬取出来并下载到本地',
    )).toBe(false);

    expect(filterGroundedClarifications(
      [{ question: '请问是 YouTube 还是 Bilibili？' }],
      '',
    )).toEqual([{ question: '请问是 YouTube 还是 Bilibili？' }]);
  });

  it('不把无关的预订类参数问当作已回答', () => {
    expect(isClarificationAlreadyGrounded(
      '请问您从哪个城市出发？出行日期是哪几天？',
      '用户此前在讨论 YouTube 热门视频',
    )).toBe(false);
  });
});
