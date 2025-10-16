class DoujinshiOne extends ComicSource {
    name = "DoujinshiOne"
    key = "doujinshione"
    version = "1.0.1"
    minAppVersion = "1.4.0"
    url = "https://raw.githubusercontent.com/Ftbom/doujinshipy_ex/main/venera/doujinshione.js"

    settings = {
        domain: { title: "domain", type: "input", default: "http://127.0.0.1:9000" },
        randomCount: { title: "random_number", type: "input", default: "6" },
        fImgProxy: { title: "force_proxy_image", type: "switch", default: false }
    }

    get baseUrl() {
        const api = this.loadSetting('domain') || this.settings.domain.default;
        return api.replace(/\/$/, '');
    }

    get headers() {
        const token = this.loadData('token');
        if ((token == "") || (token == null)) {
            throw this.translate("need_token"); // token提示
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
                let data = [this.translate("all")];
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
            title: "DoujinshiOne",
            type: "mixed",
            load: async (page) => {
                const data = [];
                if (page == 1) {
                    // 获取随机数目
                    let randomNum = 6;
                    try {
                        randomNum = parseInt(this.loadSetting('randomCount'));
                    } catch (_) {
                        randomNum = 6;
                    }
                    // 随机
                    const random_res = await Network.get(`${this.baseUrl}/doujinshi/random?num=${randomNum}`, this.headers);
                    const random_result = JSON.parse(random_res.body);
                    if (random_res.status != 200) {
                        throw random_result.error;
                    }
                    const random_doujinshis = this.parseDoujinshis(random_result.data).comics;
                    data.push({
                        title: this.translate("random"),
                        comics: random_doujinshis
                    });
                }
                const res = await Network.get(`${this.baseUrl}/doujinshi?page=-${page}`, this.headers);
                const result = JSON.parse(res.body);
                if (res.status != 200) {
                    throw result.error;
                }
                const doujinshis = this.parseDoujinshis(result.data);
                data.push(doujinshis.comics);
                return {
                    data: data,
                    maxPage: doujinshis.maxPage + 1
                };
            }
        }
    ]

    category = {
        title: "DoujinshiOne",
        parts: [
            {
                name: "Sources",
                type: "dynamic",
                loader: () => {
                    const data = this.loadData('sources');
                    const items = [];
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
                        });
                    }
                    return items;
                }
            },
            {
                name: "Groups",
                type: "dynamic",
                loader: () => {
                    const data = this.loadData('groups');
                    const items = [];
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
                        });
                    }
                    return items;
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
                if (category == this.translate("all")) {
                    category = "";
                }
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
            if ((param == "group") || (category == this.translate("all"))) {
                return [
                    {
                        options: [
                            "1-asc",
                            "2-desc",
                            "3-random"
                        ]
                    }
                ]
            } else {
                return [
                    {
                        options: [
                            "1-asc",
                            "2-desc"
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
                    "1-asc",
                    "2-desc"
                ],
                label: "sort"
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

    // 添加tag
    pushTag(tag_map, type, value) {
        if (type == "category") {
            value = this.translate(value); // 转换类别tag
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
            let tags = {"doujinshi_source": [data.source], "doujinshi_group": data.groups};
            for (let tag of data.tags) {
                const tag_s = tag.split(":");
                if (tag_s.length == 1) {
                    this.pushTag(tags, "unknown", tag_s[0].trim());
                    continue;
                }
                this.pushTag(tags, tag_s[0].trim(), tag_s[1].trim())
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
            if (namespace == "category") {
                const locale = APP.locale;
                if (locale in this.translation) {
                    tag = Object.keys(this.translation[locale])
                    .filter(k => this.translation[locale][k] == tag);
                }
            }
            let tag_str = "";
            if ("doujinshi_group" == namespace) {
                return {
                    // 转到分组
                    action: 'category',
                    keyword: tag,
                    param: "group",
                };
            } else if ("doujinshi_source" == namespace) {
                return {
                    // 转到源
                    action: 'category',
                    keyword: tag,
                    param: "source_name",
                };
            } else if ("unknown" == namespace) {
                tag_str = tag;
            } else {
                tag_str = `${namespace}:${tag}`;
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
    
    translation = {
        'zh_CN': {
            "domain": "域名",
            "random_number": "随机项数目",
            "force_proxy_image": "强制服务器代理图片",
            "need_token": "请使用TOKEN登录",
            "doujinshi_group": "分组",
            "doujinshi_source": "源",
            "asc": "正序",
            "desc": "倒序",
            "random": "随机",
            "all": "全部",
            "sort": "排序",
            "language": "语言",
            "artist": "画师",
            "male": "男性",
            "female": "女性",
            "mixed": "混合",
            "other": "其它",
            "parody": "原作",
            "character": "角色",
            "group": "团队",
            "cosplayer": "Coser",
            "category": "类别",
            "unknown": "未知",
            "doujinshi": "同人志",
            "manga": "漫画",
            "artistcg": "画师CG",
            "gamecg": "游戏CG",
            "non-h": "无H",
            "imageset": "图集",
            "western": "西方",
            "cosplay": "Cosplay",
            "misc": "杂项",
            "asianporn": "亚洲色情"
        },
        'zh_TW': {
            "domain": "域名",
            "random_number": "隨機項數目",
            "force_proxy_image": "強制服務器代理圖片",
            "need_token": "請使用TOKEN登錄",
            "doujinshi_group": "分組",
            "doujinshi_source": "源",
            "asc": "正序",
            "desc": "倒序",
            "random": "隨機",
            "all": "全部",
            "sort": "排序",
            "language": "語言",
            "artist": "畫師",
            "male": "男性",
            "female": "女性",
            "mixed": "混合",
            "other": "其他",
            "parody": "原作",
            "character": "角色",
            "group": "團隊",
            "cosplayer": "Coser",
            "category": "類別",
            "unknown": "未知",
            "doujinshi": "同人誌",
            "manga": "漫畫",
            "artistcg": "畫師CG",
            "gamecg": "遊戲CG",
            "non-h": "無H",
            "imageset": "圖集",
            "western": "西方",
            "cosplay": "Cosplay",
            "misc": "雜項",
            "asianporn": "亞洲色情"
        },
        'en_US': {
            "domain": "Domain",
            "random_number": "Number of random items",
            "force_proxy_image": "Force server to proxy images",
            "need_token": "Please log in using TOKEN",
            "doujinshi_group": "Group",
            "doujinshi_source": "Source",
            "asc": "Ascending",
            "desc": "Descending",
            "random": "Random",
            "all": "All",
            "sort": "Sort",
            "language": "Language",
            "artist": "Artist",
            "male": "Male",
            "female": "Female",
            "mixed": "Mixed",
            "other": "Other",
            "parody": "Parody",
            "character": "Character",
            "group": "Group",
            "cosplayer": "Coser",
            "category": "Category",
            "unknown": "Unknown",
            "doujinshi": "Doujinshi",
            "manga": "Manga",
            "artistcg": "Artist CG",
            "gamecg": "Game CG",
            "non-h": "Non-H",
            "imageset": "Image Set",
            "western": "Western",
            "cosplay": "Cosplay",
            "misc": "Misc",
            "asianporn": "Asian Porn"
        }

    }
}
