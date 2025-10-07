/** @type {import('./_venera_.js')} */
class DoujinshiOne extends ComicSource {
    name = "DoujinshiOne"
    key = "doujinshione"
    version = "1.0.0"
    minAppVersion = "1.4.0"
    url = "https://git.nyne.dev/nyne/venera-configs/raw/branch/main/lanraragi.js"

    settings = {
        domain: { title: "域名", type: "input", default: "http://127.0.0.1:9000" },
        randomCount: { title: "随机项数目", type: "input", default: "6" },
        fImgProxy: { title: "强制服务器代理图片", type: "switch", default: false }
    }

    get baseUrl() {
        const api = this.loadSetting('domain') || this.settings.domain.default;
        return api.replace(/\/$/, '');
    }

    get headers() {
        const token = this.loadData('token');
        if ((token == "") || (token == null)) {
            throw "请使用TOKEN登录"; // token提示
        }
        const apiKey = "Bearer " + token;
        return {
            "Authorization": `${apiKey}`,
        };
    }

    async updateGroups() {
        try {
            const res = await Network.get(`${this.baseUrl}/group`, this.headers);
            if (res.status != 200) {
                this.saveData('groups', {});
                this.saveData('groups_', {});
            } else {
                let data = {};
                let data_ = {};
                try {
                    const result = JSON.parse(res.body);
                    for (let d of result.data) {
                        // 储存group信息
                        const name = `${d.name} (${d.itemCount})`; // 名称 (数目)
                        data[name] = d.id;
                        data_[d.id] = name;
                    }
                } catch (_) {
                    data = {};
                    data_ = {};
                }
                this.saveData('groups', data);
                this.saveData('groups_', data_);
            }
        } catch (_) {
            this.saveData('groups', {});
            this.saveData('groups_', {});
        }
    }

    account = {
        loginWithCookies: {
            fields: [
                "token",
            ],
            validate: async (values) => {
                this.saveData('token', values[0]); // 储存token
                return true;
            }
        },
        logout: () => {
            this.deleteData('token'); //删除token
        },
        registerWebsite: null
    }

    async init() {
        try {
            // 储存源信息
            const res = await Network.get(this.baseUrl, this.headers);
            if (res.status != 200) {
                this.saveData('sources', []);
            } else {
                let data = [];
                try {
                    const result = JSON.parse(res.body);
                    for (let source in result.sources) {
                        data.push(source);
                    }
                } catch (_) {
                    data = [];
                }
                this.saveData('sources', data);
            }
        } catch (_) {
            this.saveData('sources', []);
        }
        await this.updateGroups();
    }

    // 提取doujinshi信息
    parseDoujinshis(result) {
        let doujinshis = [];
        for (let d of result.doujinshis) {
            let tags = [];
            for (let tag of d.tags) {
                try {
                    tags.push(tag.split(":")[1].trim());
                } catch (_) {
                    tags.push(tag);
                }
            }
            doujinshis.push(new Comic({
                id: d.id,
                title: d.title,
                cover: this.baseUrl + d.cover,
                tags: tags,
                description: d.groups.join(",")
            }));
        }
        let maxPage = 1;
        if (result.page != 0) {
            maxPage = Math.ceil(result.total / result.pageSize);
        }
        return { comics: doujinshis, maxPage: maxPage };
    }

    explore = [
        {
            title: "随机",
            type: "multiPageComicList",
            load: async () => {
                // 获取随机数目
                let randomNum = 6;
                try {
                    randomNum = parseInt(this.loadSetting('randomCount'));
                } catch (_) {
                    randomNum = 6;
                }
                // 随机
                const res = await Network.get(`${this.baseUrl}/doujinshi/random?num=${randomNum}`, this.headers);
                const result = JSON.parse(res.body);
                if (res.status != 200) {
                    throw result.error;
                }
                return this.parseDoujinshis(result.data);
            }
        }
    ]

    category = {
        title: "分类",
        parts: [
            {
                name: "分组",
                type: "dynamic",
                loader: () => {
                    const data = this.loadData('groups')
                    const items = []
                    for (const g in data) {
                        items.push({
                            label: g,
                            target: {
                                page: 'category',
                                attributes: {
                                    category: g,
                                    param: "group"
                                }
                            }
                        })
                    }
                    return items
                }
            },
            {
                name: "源",
                type: "dynamic",
                loader: () => {
                    const data = this.loadData('sources')
                    const items = []
                    for (const s of data) {
                        items.push({
                            label: s,
                            target: {
                                page: 'category',
                                attributes: {
                                    category: s,
                                    param: "source_name"
                                }
                            }
                        })
                    }
                    return items
                }
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page = 1) => {
            let isRandom = false;
            let random_str = "";
            let url = "";
            // 正序/倒序
            let sort = 1;
            if (options[0] == "2") {
                sort = -1;
            } else if (options[0] == "3") {
                isRandom = true;
            }
            // 处理group
            if (param == "group") {
                let groups = {};
                const _groups = this.loadData('groups');
                if (category in _groups) {
                    groups = _groups;
                } else {
                    for (let g in _groups) {
                        groups[g.split(" (")[0]] = _groups[g];
                    }
                }
                category = groups[category];
                random_str = `group=${category}`
            }
            if (isRandom) {
                // 随机
                let randomNum = 6;
                try {
                    randomNum = parseInt(this.loadSetting('randomCount'));
                } catch (_) {
                    randomNum = 6;
                }
                url = `${this.baseUrl}/doujinshi/random?num=${randomNum}&${random_str}`;
            } else {
                // 正常
                url = `${this.baseUrl}/search?query=&${param}=${category}&page=${sort * page}`;
            }
            const res = await Network.get(url, this.headers);
            const result = JSON.parse(res.body);
            if (res.status != 200) {
                throw result.error;
            }
            return this.parseDoujinshis(result.data);
        },
        optionLoader: async (category, param) => {
            if (param == "group") {
                return [
                    {
                        options: [
                            "1-正序",
                            "2-倒序",
                            "3-随机"
                        ]
                    }
                ]
            } else {
                return [
                    {
                        options: [
                            "1-正序",
                            "2-倒序"
                        ]
                    }
                ]
            }
        }
    }

    search = {
        load: async (keyword, options, page) => {
            if (keyword.search(":") != -1) {
                // 处理搜索关键词
                const searchKeys = keyword.match(/(?:\w+:'[^']+'|\w+:[^\s']+|[^\s']+)/g);
                for (let i = 0; i < searchKeys.length; i ++) {
                    searchKeys[i] = searchKeys[i].replaceAll(`'`, '');
                }
                keyword = searchKeys.join("$,");
            }
            let sort = 1;
            if (options[0] == "2") {
                sort = -1;
            }
            const url = `${this.baseUrl}/search?query=${keyword}&page=${sort * page}`
            const res = await Network.get(url, this.headers);
            const result = JSON.parse(res.body);
            if (res.status != 200) {
                throw result.error;
            }
            return this.parseDoujinshis(result.data);
        },
        optionList: [
            {
                options: [
                    "1-正序",
                    "2-倒序"
                ],
                label: "排序"
            }
        ],
        enableTagsSuggestions: true,
    }

    favorites = {
        multiFolder: true,
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            if (isAdding) {
                // 添加doujinshi到分组
                const groups = this.loadData('groups_');
                const res = await Network.post(`${this.baseUrl}/batch`, this.headers,
                    {
                        operation: "group",
                        name: groups[folderId].split(" (")[0],
                        target: [comicId],
                        replace: false
                    });
                if (res.status != 200) {
                    throw JSON.parse(res.body).error;
                }
            } else {
                // 从分组删除doujinshi
                const res = await Network.delete(`${this.baseUrl}/group/${folderId}/${comicId}`, this.headers);
                if (res.status != 200) {
                    throw JSON.parse(res.body).error;
                }
            }
            this.updateGroups(); //更新group信息
            return 'ok';
        },
        loadFolders: async (comicId) => {
            const groups = this.loadData('groups_');
            if (comicId == null) {
                return {folders: groups, favorited: []}; // 获取所有分组
            }
            // 获取分组，以及doujinshi所属分组
            const res = await Network.get(`${this.baseUrl}/doujinshi/${comicId}/metadata`, this.headers)
            const result = JSON.parse(res.body);
            if (res.status != 200) {
                throw result.error;
            }
            const groups_ = {};
            const _groups = this.loadData('groups');
            for (let g in _groups) {
                groups_[g.split(" (")[0]] = _groups[g];
            }
            let cIds = [];
            for (let g of result.data.groups) {
                cIds.push(groups_[g]);
            }
            return {folders: groups, favorited: cIds};
        },
        addFolder: async (name) => {
            // 添加到分组
            const res = await Network.post(`${this.baseUrl}/batch`, this.headers,
                {
                    operation: "group",
                    name: name,
                    target: ["null"],
                    replace: false
                }
            );
            if (res.status != 200) {
                throw JSON.parse(res.body).error;
            }
            await this.updateGroups();
            return 'ok';
        },
        deleteFolder: async (folderId) => {
            // 删除分组
            const res = await Network.delete(`${this.baseUrl}/group/${folderId}`, this.headers);
            if (res.status != 200) {
                throw JSON.parse(res.body).error;
            }
            await this.updateGroups();
            return 'ok';
        },
        loadComics: async (page, folder) => {
            // 加载分组下doujinshi
            const res = await Network.get(`${this.baseUrl}/search?query=&group=${folder}&page=${page}`, this.headers);
            const result = JSON.parse(res.body);
            if (res.status != 200) {
                throw result.error;
            }
            return this.parseDoujinshis(result.data);
        },
        singleFolderForSingleComic: false
    }

    // 转换tag
    transTag(tag_map, type, value) {
        const tag_type_name = {category: "类别", female: "女性", male: "男性", mixed: "混合",
            other: "其他", group: "团队", artist: "艺术家", cosplayer: "Coser", parody: "原作",
            character: "角色", language: "语言"};
        const doujinshi_type_name = {doujinshi: "同人志", manga: "漫画", artistcg: "画师CG",
            gamecg: "游戏CG", "non-h": "无H", imageset: "图集", western: "西方", cosplay: "Cosplay",
            misc: "杂项", asianporn: "亚洲色情"};
        if (type == "category") {
            if (value in doujinshi_type_name) {
                value = doujinshi_type_name[value];
            }
        }
        if (type in tag_type_name) {
            type = tag_type_name[type];
        } else {
            type = "未知";
        }
        if (type in tag_map) {
            tag_map[type].push(value);
        } else {
            tag_map[type] = [value];
        }
    }

    comic = {
        loadInfo: async (id) => {
            // 获取doujinshi信息
            const res = await Network.get(`${this.baseUrl}/doujinshi/${id}/metadata`, this.headers)
            const result = JSON.parse(res.body);
            if (res.status != 200) {
                throw result.error;
            }
            const data = result.data;
            let tags = {"源": [data.source], "分组": data.groups};
            for (let tag of data.tags) {
                const tag_s = tag.split(":");
                if (tag_s.length == 1) {
                    this.transTag(tags, "未知", tag_s[0].trim());
                    continue;
                }
                this.transTag(tags, tag_s[0].trim(), tag_s[1].trim())
            }
            return new ComicDetails({
                id: data.id,
                title: data.title,
                cover: this.baseUrl + data.cover,
                isFavorite: null,
                tags
            });
        },
        starRating: async (id, rating) => { },
        loadEp: async (comicId, epId) => {
            // 加载doujinshi图片
            const res = await Network.get(`${this.baseUrl}/doujinshi/${comicId}/pages`, this.headers)
            const result = JSON.parse(res.body);
            if (res.status != 200) {
                throw result.error;
            }
            let proxyImg = this.loadSetting('fImgProxy');
            if (proxyImg == "false") {
                proxyImg = false;
            }
            const images = [];
            if ("urls" in result.data) {
                let pageNum = 0;
                for (let img of result.data.urls) {
                    if (proxyImg) {
                        images.push(`${this.baseUrl}/doujinshi/${comicId}/page/${pageNum}`);
                        pageNum = pageNum + 1;
                    } else {
                        // web图片
                        images.push(`${img}||||${JSON.stringify(result.data.headers)}`);
                    }
                }
            } else {
                for (let img of result.data) {
                    if (proxyImg) {
                        img = img.replace("/pageinfo/", "/page/")
                    }
                    images.push(this.baseUrl + img);
                }
            }
            return { images }
        },
        onImageLoad: async (url, comicId, epId) => {
            const url_s = url.split("||||");
            if (url_s.length != 1) {
                return {
                    // web图片
                    url: url_s[0],
                    headers: JSON.parse(url_s[1])
                };
            }
            if ((url.search(this.baseUrl) != -1) && (url.search("/pageinfo/") != -1)) {
                const res = await Network.get(url, this.headers);
                const result = JSON.parse(res.body);
                return {
                    // pageinfo
                    url: result.data.url,
                    headers: result.data.headers
                };
            }
            return {
                // 一般情况
                headers: this.headers
            };
        },
        onThumbnailLoad: (url) => {
            return {
                headers: this.headers
            }
        },
        onClickTag: (namespace, tag) => {
            let tag_str = "";
            const trans1 = {"同人志": "doujinshi", "漫画": "manga", "画师CG": "artistcg",
                "游戏CG": "gamecg", "无H": "non-h", "图集": "imageset", "西方": "western", "Cosplay": "cosplay",
                "杂项": "misc", "亚洲色情": "asianporn"};
            if (tag in trans1) {
                tag = trans1[tag];
            }
            const trans2 = {"类别": "category", "女性": "female", "男性": "male", "混合": "mixed",
                "其他": "other", "团队": "group", "艺术家": "artist", "Coser": "cosplayer", "原作": "parody",
                "角色": "character", "语言": "language"};
            if (namespace in trans2) {
                tag_str = `${trans2[namespace]}:${tag}`;
            } else {
                if ("分组" == namespace) {
                    return {
                        // 转到分组
                        action: 'category',
                        keyword: tag,
                        param: "group",
                    };
                } else if ("源" == namespace) {
                    return {
                        // 转到源
                        action: 'category',
                        keyword: tag,
                        param: "source_name",
                    };
                } else {
                    tag_str = tag;
                }
            }
            return {
                // 转到tag搜索
                action: 'search',
                keyword: tag_str,
                param: null,
            }
        },
        enableTagsTranslate: true,
    }
}
