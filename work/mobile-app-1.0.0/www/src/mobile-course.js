(() => {
  const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1', '综合'];
  const CATEGORIES = ['教材', '语法', '词汇', '听力', '会话', '考试', '其他'];

  function normalizeCourse(course) {
    const totalLessons = Math.min(
      5000,
      Math.max(1, Math.round(Number(course?.totalLessons) || 1)),
    );
    const completedLessons = Math.min(
      totalLessons,
      Math.max(0, Math.round(Number(course?.completedLessons) || 0)),
    );
    return {
      id: String(course?.id || `mobile-course-${Date.now()}`),
      title: String(course?.title || '未命名网课').trim().slice(0, 120),
      level: LEVELS.includes(course?.level) ? course.level : '综合',
      category: CATEGORIES.includes(course?.category)
        ? course.category
        : '其他',
      totalLessons,
      completedLessons,
      notes: String(course?.notes || '').trim().slice(0, 1000),
      checkins: [
        ...new Set(
          (Array.isArray(course?.checkins) ? course.checkins : []).filter(
            (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day)),
          ),
        ),
      ].sort(),
      createdAt: Number(course?.createdAt) || Date.now(),
      updatedAt: Number(course?.updatedAt) || Date.now(),
    };
  }

  function mobileCourses() {
    if (!Array.isArray(state.mobileCourses)) state.mobileCourses = [];
    state.mobileCourses = state.mobileCourses
      .filter(Boolean)
      .map(normalizeCourse)
      .slice(0, 500);
    return state.mobileCourses;
  }

  function courseStatus(course) {
    if (course.completedLessons >= course.totalLessons) return '已完成';
    if (course.completedLessons > 0 || course.checkins.length) return '学习中';
    return '未开始';
  }

  function coursePercent(course) {
    return Math.min(
      100,
      Math.round((course.completedLessons / course.totalLessons) * 100),
    );
  }

  function courseCheckinAt(course) {
    return course.checkins.length
      ? course.checkins[course.checkins.length - 1]
      : '';
  }

  function saveMobileCourses() {
    scheduleSave();
  }

  function addCheckin(course, date = todayKey()) {
    if (!course.checkins.includes(date)) {
      course.checkins.push(date);
      course.checkins.sort();
    }
    course.updatedAt = Date.now();
    recordActivity(
      'courses',
      `网课打卡：${course.title} ${course.completedLessons}/${course.totalLessons}`,
    );
  }

  window.courseSessionEntries = function courseSessionEntriesMobile() {
    return mobileCourses().flatMap((course) =>
      course.checkins.map((day) => ({
        at: new Date(`${day}T12:00:00`).getTime(),
        title: course.title,
        courseId: course.id,
        completed: true,
        durationMinutes: 0,
      })),
    );
  };

  window.courseSessionCountForDate = function courseSessionCountForDateMobile(
    dateKey,
  ) {
    return window
      .courseSessionEntries()
      .filter(
        (item) => localDateKey(item.at) === dateKey,
      ).length;
  };

  window.courseSessionCountThisWeek =
    function courseSessionCountThisWeekMobile() {
      return window
        .courseSessionEntries()
        .filter((item) => timestampInCurrentWeek(item.at)).length;
    };

  function openCourseEditor(courseId = '') {
    const course = mobileCourses().find((item) => item.id === courseId);
    openModal(`
      <h3>${course ? '编辑网课' : '新增网课'}</h3>
      <p>只记录你的课程名称和手动进度，不搜索网页、不嵌入播放器。</p>
      <div class="mobile-course-form">
        <label>课程名称
          <input id="mobile-course-title" type="text" maxlength="120"
            value="${esc(course?.title || '')}" placeholder="例如：大家的日语初级 1" />
        </label>
        <label>预计总课数
          <input id="mobile-course-total" type="number" min="1" max="5000"
            value="${course?.totalLessons || 24}" />
        </label>
        <label>已完成课数
          <input id="mobile-course-completed" type="number" min="0" max="5000"
            value="${course?.completedLessons || 0}" />
        </label>
        <label>JLPT 范围
          <select id="mobile-course-level">
            ${LEVELS.map(
              (level) =>
                `<option value="${level}"${level === (course?.level || '综合') ? ' selected' : ''}>${level}</option>`,
            ).join('')}
          </select>
        </label>
        <label>分类
          <select id="mobile-course-category">
            ${CATEGORIES.map(
              (category) =>
                `<option value="${category}"${category === (course?.category || '其他') ? ' selected' : ''}>${category}</option>`,
            ).join('')}
          </select>
        </label>
        <label class="mobile-course-notes">备注
          <textarea id="mobile-course-notes" maxlength="1000"
            placeholder="教材章节、学习目标或其他说明">${esc(course?.notes || '')}</textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" data-action="modal-cancel">取消</button>
        <button class="primary-button" type="button" data-action="mobile-course-save"
          data-course-id="${esc(course?.id || '')}">保存课程</button>
      </div>`);
    document.getElementById('mobile-course-title')?.focus();
  }

  window.renderCourse = function renderMobileCoursePage() {
    const courses = mobileCourses();
    const today = todayKey();
    const todayCheckins = window.courseSessionCountForDate(today);
    const completedCourses = courses.filter(
      (course) => course.completedLessons >= course.totalLessons,
    ).length;
    const totalLessons = courses.reduce(
      (total, course) => total + course.totalLessons,
      0,
    );
    const completedLessons = courses.reduce(
      (total, course) => total + course.completedLessons,
      0,
    );
    const overall = totalLessons
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;
    return `
      <div class="page mobile-course-page">
        <section class="mobile-course-hero">
          <div>
            <span class="translation-kicker">MY COURSE CHECK-IN</span>
            <h2>网课进度打卡</h2>
            <p>自己添加课程、填写总课数和完成进度；打开课程不会自动算作完成，只有打卡或手动加课才计入。</p>
          </div>
          <button class="primary-button" type="button" data-action="mobile-course-add">新增网课</button>
        </section>
        <div class="mobile-course-stats">
          <div><strong>${courses.length}</strong><span>课程</span></div>
          <div><strong>${completedCourses}</strong><span>已完成</span></div>
          <div><strong>${todayCheckins}</strong><span>今日打卡</span></div>
          <div><strong>${overall}%</strong><span>总体进度</span></div>
        </div>
        ${
          courses.length
            ? `<div class="mobile-course-list">
                ${courses
                  .map((course) => {
                    const percent = coursePercent(course);
                    const checkedToday = course.checkins.includes(today);
                    const lastCheckin = courseCheckinAt(course);
                    return `
                      <article class="mobile-course-card">
                        <div class="mobile-course-card-head">
                          <div>
                            <span class="word-badge level-badge">${esc(course.level)}</span>
                            <span class="word-badge">${esc(course.category)}</span>
                          </div>
                          <span class="mobile-course-status${percent === 100 ? ' done' : ''}">${courseStatus(course)}</span>
                        </div>
                        <h3>${esc(course.title)}</h3>
                        <div class="mobile-course-progress-copy">
                          <span>已完成 ${course.completedLessons}/${course.totalLessons} 课</span>
                          <strong>${percent}%</strong>
                        </div>
                        <div class="mobile-course-progress"><i style="width:${percent}%"></i></div>
                        <p class="mobile-course-meta">
                          ${lastCheckin ? `最近打卡：${esc(lastCheckin)}` : '还没有打卡记录'}
                          ${course.notes ? ` · ${esc(course.notes)}` : ''}
                        </p>
                        <div class="mobile-course-actions">
                          <button class="small-button" type="button" data-action="mobile-course-lesson-add"
                            data-course-id="${esc(course.id)}" ${course.completedLessons >= course.totalLessons ? 'disabled' : ''}>+1 课</button>
                          <button class="small-button" type="button" data-action="mobile-course-lesson-undo"
                            data-course-id="${esc(course.id)}" ${course.completedLessons <= 0 ? 'disabled' : ''}>−1 课</button>
                          <button class="${checkedToday ? 'secondary-button' : 'primary-button'}" type="button"
                            data-action="mobile-course-checkin" data-course-id="${esc(course.id)}"
                            ${checkedToday ? 'disabled' : ''}>${checkedToday ? '今日已打卡' : '今日打卡'}</button>
                          <button class="small-button" type="button" data-action="mobile-course-edit"
                            data-course-id="${esc(course.id)}">编辑</button>
                          <button class="small-button" type="button" data-action="mobile-course-delete"
                            data-course-id="${esc(course.id)}">删除</button>
                        </div>
                      </article>`;
                  })
                  .join('')}
              </div>`
            : `<div class="panel"><div class="empty"><div class="empty-mark">講</div>
                还没有网课。点击“新增网课”，填写课程名称和总课数后开始记录进度。
              </div></div>`
        }
      </div>`;
  };

  window.markStudyCourseDay = function markMobileCourseDay() {
    const courses = mobileCourses();
    if (!courses.length) {
      go('courses');
      openCourseEditor();
      return;
    }
    const course =
      courses.find((item) => item.completedLessons < item.totalLessons) ||
      courses[0];
    addCheckin(course);
    saveMobileCourses();
    render(true);
    toast(`已为「${course.title}」完成今日打卡`);
  };

  window.openPlanCourseSearch = function openMobilePlanCourse() {
    go('courses');
    if (!mobileCourses().length) {
      openCourseEditor();
    }
  };

  function saveCourseFromModal(courseId) {
    const title = document.getElementById('mobile-course-title')?.value.trim();
    const totalLessons = Number(
      document.getElementById('mobile-course-total')?.value,
    );
    const completedLessons = Number(
      document.getElementById('mobile-course-completed')?.value,
    );
    if (!title) {
      toast('请填写课程名称');
      return;
    }
    if (!Number.isFinite(totalLessons) || totalLessons < 1) {
      toast('预计总课数至少为 1');
      return;
    }
    const existing = mobileCourses().find((item) => item.id === courseId);
    const next = normalizeCourse({
      ...(existing || {}),
      id: courseId || `mobile-course-${Date.now()}`,
      title,
      totalLessons,
      completedLessons: Number.isFinite(completedLessons)
        ? completedLessons
        : 0,
      level: document.getElementById('mobile-course-level')?.value,
      category: document.getElementById('mobile-course-category')?.value,
      notes: document.getElementById('mobile-course-notes')?.value,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    const list = mobileCourses().filter((item) => item.id !== next.id);
    state.mobileCourses = [next, ...list];
    scheduleSave();
    closeModal();
    render(true);
    toast(existing ? '网课信息已更新' : '网课已添加');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-action]');
    if (!button || !String(button.dataset.action).startsWith('mobile-course-')) {
      return;
    }
    event.preventDefault();
    const action = button.dataset.action;
    const id = button.dataset.courseId || '';
    if (action === 'mobile-course-add') {
      openCourseEditor();
      return;
    }
    if (action === 'mobile-course-save') {
      const modalButton = button.closest('.modal');
      if (modalButton) {
        saveCourseFromModal(id);
      }
      return;
    }
    const course = mobileCourses().find((item) => item.id === id);
    if (!course && action !== 'mobile-course-save') return;
    if (action === 'mobile-course-edit') {
      openCourseEditor(id);
      return;
    }
    if (action === 'mobile-course-delete') {
      if (!window.confirm(`确定删除「${course.title}」吗？学习打卡记录也会一并删除。`)) {
        return;
      }
      state.mobileCourses = mobileCourses().filter((item) => item.id !== id);
      scheduleSave();
      render(true);
      toast('网课已删除');
      return;
    }
    if (action === 'mobile-course-lesson-add') {
      if (course.completedLessons < course.totalLessons) {
        course.completedLessons += 1;
        addCheckin(course);
      }
    } else if (action === 'mobile-course-lesson-undo') {
      course.completedLessons = Math.max(0, course.completedLessons - 1);
      course.updatedAt = Date.now();
    } else if (action === 'mobile-course-checkin') {
      addCheckin(course);
    }
    scheduleSave();
    render(true);
    toast('网课进度已保存');
  });

  if (ROUTE_META.courses) {
    ROUTE_META.courses.eyebrow = '学习打卡';
    ROUTE_META.courses.title = '网课进度';
  }
})();
